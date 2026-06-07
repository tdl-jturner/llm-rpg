import type { SubmitInputResponse, HudData } from './shared/ipc';
import { parseIntent } from './intent-parser';
import type { Intent } from './intent-parser';
import { parseIntentWithNl } from './nl-intent-parser';
import { assembleBlurb } from './blurb-assembler';
import { getRefusal as _getRefusal } from './refusal-bank';
import { resolveTarget } from './target-resolver';
import type { Entity } from './target-resolver';
import type { WorldDB, ItemRow, MonsterRow } from './world-db';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';

/**
 * Wraps getRefusal to apply WORLD.md overrides and emit a `refusal` log event.
 */
function emitRefusal(
  key: string,
  logger: EventLogger | undefined,
  refusals: Record<string, string> | undefined,
): string {
  const message = _getRefusal(key, refusals);
  logger?.logRefusal({ key, message, overridden: refusals != null && key in refusals });
  return message;
}

/**
 * Disambiguation state — persisted between calls while the player is resolving
 * an ambiguous target. Cleared after one resolution attempt (success or failure).
 */
interface DisambiguationState {
  candidates: Entity[];
  /** The original intent that triggered disambiguation ('look_at' | 'take' | 'attack') */
  pendingIntent: 'look_at' | 'take' | 'attack';
}

// Module-level disambiguation state (single player game — one session at a time)
let disambiguationState: DisambiguationState | null = null;

/** Exposed for testing — resets the disambiguation state. */
export function resetDisambiguationState(): void {
  disambiguationState = null;
}

/** Exposed for testing — returns current disambiguation state. */
export function getDisambiguationState(): DisambiguationState | null {
  return disambiguationState;
}

/**
 * Assembles a full room description for the current room — identical to what
 * the LOOK command produces. Used at world-load time (create / continue) so
 * the player immediately sees items, monsters, scenery, and exits rather than
 * only the bare architectural fixed_description.
 */
export function buildInitialRoomDescription(worldDB: WorldDB): string {
  const room = worldDB.getCurrentRoom();
  const scenery = worldDB.getSceneryForRoom(room.id);
  const items = worldDB.getItemsInRoom(room.id);
  const monsters = worldDB.getMonstersInRoom(room.id);
  const exits = worldDB.getCurrentRoomExits();
  return assembleBlurb(room, {
    items: items.map((i) => ({ name: i.name, room_blurb: i.room_blurb, disturbed: i.disturbed === 1 })),
    monsters: monsters.map((m) => ({ room_blurb: m.room_blurb })),
    scenery,
    exits,
  });
}

/**
 * Build HUD snapshot from the current world state.
 * Called after every turn to keep the renderer's HUD strip up to date.
 */
export function buildHudData(worldDB: WorldDB): HudData {
  const player = worldDB.getPlayerState();
  const weapon = worldDB.getEquippedWeapon();
  const room = worldDB.getCurrentRoom();
  return {
    hp: player.hp,
    max_hp: player.max_hp,
    weapon: weapon ? { name: weapon.name, damage_min: weapon.damage_min, damage_max: weapon.damage_max } : null,
    room_name: room.name,
  };
}

export async function handleSubmitInput(
  text: string,
  worldDB?: WorldDB,
  generationLlmFn?: LLMFunction,
  logger?: EventLogger,
  worldBody?: string,
  refusals?: Record<string, string>,
  nlLlmFn?: LLMFunction,
): Promise<SubmitInputResponse> {
  // Use dedicated NL parser LLM when provided, otherwise fall back to the generation LLM.
  const parserLlmFn = nlLlmFn ?? generationLlmFn;
  if (!worldDB) {
    // Fallback for tests that don't provide a DB
    return { narrative: [`> ${text}`] };
  }

  // ── Disambiguation resolution ──────────────────────────────────────────────
  if (disambiguationState) {
    const saved = disambiguationState;
    disambiguationState = null; // always clear, regardless of outcome

    const trimmed = text.trim().toLowerCase();
    const picked = saved.candidates.find((c) => c.name.toLowerCase() === trimmed);

    if (picked) {
      // Valid pick — resolve the original intent
      const result = await resolveEntityIntentAsync(saved.pendingIntent, picked, worldDB, logger, refusals);
      return { narrative: [`> ${text}`, ...result] };
    } else {
      // Invalid pick — cancel disambiguation and treat as fresh input
      // Fall through to normal intent parsing below
    }
  }

  // ── Logging: raw input ────────────────────────────────────────────────────
  logger?.logInputRaw({ raw: text });

  // ── Intent parsing ────────────────────────────────────────────────────────
  let intent = parseIntent(text);
  let parsePath: 'deterministic' | 'llm' = 'deterministic';

  if (intent.type === 'unknown' && parserLlmFn && worldBody) {
    // Deterministic parser couldn't match — try the NL fallback
    const nlResult = await parseIntentWithNl(text, { llmFn: parserLlmFn, worldBody });

    if (nlResult === 'chained') {
      // Multi-action input — reject immediately
      logger?.logInputParsed({ raw: text, intent: { type: 'chained' }, path: 'llm' });
      return { narrative: [`> ${text}`, emitRefusal('chained_command_rejected', logger, refusals)] };
    }

    intent = nlResult as Intent;
    parsePath = 'llm';
  }

  // Log the resolved intent
  logger?.logInputParsed({
    raw: text,
    intent,
    path: parsePath,
    ...(intent.instrument !== undefined ? { instrument: intent.instrument } : {}),
  });

  const narrative: string[] = [`> ${text}`];

  switch (intent.type) {
    case 'look': {
      const room = worldDB.getCurrentRoom();
      const scenery = worldDB.getSceneryForRoom(room.id);
      const items = worldDB.getItemsInRoom(room.id);
      const monsters = worldDB.getMonstersInRoom(room.id);
      const exits = worldDB.getCurrentRoomExits();
      narrative.push(assembleBlurb(room, {
        items: items.map((i) => ({ name: i.name, room_blurb: i.room_blurb, disturbed: i.disturbed === 1 })),
        monsters: monsters.map((m) => ({ room_blurb: m.room_blurb })),
        scenery,
        exits,
      }));
      break;
    }

    case 'look_at': {
      const room = worldDB.getCurrentRoom();
      const entities = buildScopeEntities(worldDB, room.id);

      const result = resolveTarget(intent.target, entities);

      if (result.type === 'no_match') {
        narrative.push(emitRefusal('nothing_here_named', logger, refusals));
      } else if (result.type === 'unique') {
        narrative.push(result.entity.inspectionDescription);
      } else {
        // Ambiguous — enter disambiguation
        const candidateNames = result.candidates.map((c) => c.name).join(', ');
        narrative.push(`Which do you mean: ${candidateNames}?`);
        disambiguationState = { candidates: result.candidates, pendingIntent: 'look_at' };
      }
      break;
    }

    case 'take': {
      const room = worldDB.getCurrentRoom();
      const entities = buildScopeEntities(worldDB, room.id);

      const result = resolveTarget(intent.target, entities);

      if (result.type === 'no_match') {
        narrative.push(emitRefusal('nothing_here_named', logger, refusals));
      } else if (result.type === 'unique') {
        const entity = result.entity;

        if (entity.kind === 'scenery') {
          // Cannot take scenery — use WORLD.md override if present, else show the scenery's room_blurb
          const override = refusals?.['cannot_take_scenery'];
          if (override) {
            narrative.push(emitRefusal('cannot_take_scenery', logger, refusals));
          } else {
            const message = entity.roomBlurb || _getRefusal('cannot_take_scenery');
            logger?.logRefusal({ key: 'cannot_take_scenery', message, overridden: false });
            narrative.push(message);
          }
        } else if (entity.kind === 'item') {
          // Check if the item is already in inventory
          const inventory = worldDB.getPlayerInventory();
          const alreadyHave = inventory.find((i) => i.id === entity.id);
          if (alreadyHave) {
            narrative.push(`You already have the ${entity.name}.`);
          } else {
            const takenItem = worldDB.takeItem(entity.id, logger);
            let msg = `You take the ${takenItem.name}.`;
            // Check if auto-equip happened
            const equipped = worldDB.getEquippedWeapon();
            if (equipped && equipped.id === takenItem.id) {
              msg += ' You wield it.';
            }
            narrative.push(msg);
          }
        }
      } else {
        // Ambiguous — enter disambiguation
        const candidateNames = result.candidates.map((c) => c.name).join(', ');
        narrative.push(`Which do you mean: ${candidateNames}?`);
        disambiguationState = { candidates: result.candidates, pendingIntent: 'take' };
      }
      break;
    }

    case 'drop': {
      const inventory = worldDB.getPlayerInventory();
      const inventoryEntities: Entity[] = inventory.map(itemRowToEntity);

      const result = resolveTarget(intent.target, inventoryEntities);

      if (result.type === 'no_match') {
        narrative.push(emitRefusal('cant_drop_what_you_dont_have', logger, refusals));
      } else if (result.type === 'unique') {
        const droppedItem = worldDB.dropItem(result.entity.id, logger);
        narrative.push(`You drop the ${droppedItem.name}.`);
      } else {
        // Ambiguous drop — unlikely but handle gracefully
        const candidateNames = result.candidates.map((c) => c.name).join(', ');
        narrative.push(`Which do you mean: ${candidateNames}?`);
      }
      break;
    }

    case 'inventory': {
      const inventory = worldDB.getPlayerInventory();
      const equipped = worldDB.getEquippedWeapon();

      if (inventory.length === 0) {
        narrative.push(emitRefusal('inventory_empty', logger, refusals));
      } else {
        const lines = inventory.map((item) => {
          const isEquipped = equipped && equipped.id === item.id;
          return isEquipped ? `${item.name} (equipped)` : item.name;
        });
        narrative.push('You are carrying:\n' + lines.join('\n'));
      }
      break;
    }

    case 'move': {
      if (!generationLlmFn) {
        // No LLM function provided — refuse movement (shouldn't happen at runtime)
        narrative.push(emitRefusal('no_exit', logger, refusals));
        break;
      }

      // Apply parting hits from engaged monsters before moving
      const partingHits = worldDB.applyPartingHits(logger);
      if (partingHits.monster_damage_dealt > 0) {
        narrative.push(
          `As you leave, something strikes you for ${partingHits.monster_damage_dealt} damage.`,
        );
        if (partingHits.player_died) {
          const startRoom = worldDB.respawnPlayer(logger);
          narrative.push('Everything goes black. You wake at the threshold.');
          narrative.push(assembleBlurb(startRoom, {}));
          break;
        }
      }

      const result = await worldDB.movePlayer(intent.direction, generationLlmFn, logger);

      if (!result.ok) {
        if (result.reason === 'no_exit') {
          narrative.push(emitRefusal('no_exit', logger, refusals));
        } else {
          // generation_failed (legacy path — currently unreachable since world-db
          // now falls back to the Liminal Gap room rather than returning this error)
          narrative.push(`Generation failed: ${result.error ?? 'unknown error'}`);
        }
      } else {
        const room = result.room;
        const scenery = worldDB.getSceneryForRoom(room.id);
        const items = worldDB.getItemsInRoom(room.id);
        const monsters = worldDB.getMonstersInRoom(room.id);
        const exits = worldDB.getCurrentRoomExits();
        narrative.push(assembleBlurb(room, {
          items: items.map((i) => ({ name: i.name, room_blurb: i.room_blurb, disturbed: i.disturbed === 1 })),
          monsters: monsters.map((m) => ({ room_blurb: m.room_blurb })),
          scenery,
          exits,
        }));
        if (result.generationFailed) {
          narrative.push(emitRefusal('generation_failed', logger, refusals));
        }
      }
      break;
    }

    case 'attack': {
      const room = worldDB.getCurrentRoom();
      const monstersInRoom = worldDB.getMonstersInRoom(room.id);

      if (monstersInRoom.length === 0) {
        narrative.push(emitRefusal('nothing_to_attack', logger, refusals));
        break;
      }

      let targetMonster: MonsterRow | undefined;

      if (intent.target === null) {
        // Bare ATTACK — auto-target if exactly one monster is present
        if (monstersInRoom.length === 1) {
          targetMonster = monstersInRoom[0];
        } else {
          // Multiple monsters — request disambiguation
          const candidateNames = monstersInRoom.map((m) => m.name).join(', ');
          narrative.push(`Which do you mean: ${candidateNames}?`);
          const monsterEntities: Entity[] = monstersInRoom.map(monsterRowToEntity);
          disambiguationState = { candidates: monsterEntities, pendingIntent: 'attack' };
          break;
        }
      } else {
        // Named target — resolve it
        const monsterEntities: Entity[] = monstersInRoom.map(monsterRowToEntity);
        const result = resolveTarget(intent.target, monsterEntities);

        if (result.type === 'no_match') {
          narrative.push(emitRefusal('nothing_here_named', logger, refusals));
          break;
        } else if (result.type === 'ambiguous') {
          const candidateNames = result.candidates.map((c) => c.name).join(', ');
          narrative.push(`Which do you mean: ${candidateNames}?`);
          disambiguationState = { candidates: result.candidates, pendingIntent: 'attack' };
          break;
        } else {
          targetMonster = worldDB.getMonster(result.entity.id);
        }
      }

      if (!targetMonster) {
        narrative.push(emitRefusal('nothing_to_attack', logger, refusals));
        break;
      }

      const attackResult = worldDB.attackMonster(targetMonster.id, logger);

      // Render player's hit
      narrative.push(
        `You hit the ${targetMonster.name} for ${attackResult.player_damage_dealt} damage.`,
      );

      if (attackResult.monster_dead) {
        narrative.push(`The ${targetMonster.name} collapses.`);
      } else if (attackResult.monster_damage_dealt > 0) {
        narrative.push(
          `The ${targetMonster.name} strikes back for ${attackResult.monster_damage_dealt} damage.`,
        );

        if (attackResult.player_died) {
          const startRoom = worldDB.respawnPlayer(logger);
          narrative.push('Everything goes black. You wake at the threshold.');
          narrative.push(assembleBlurb(startRoom, {}));
        }
      }
      break;
    }

    case 'unknown':
    default: {
      narrative.push(emitRefusal('intent_unparseable', logger, refusals));
      break;
    }
  }

  return { narrative, hud: buildHudData(worldDB) };
}

/**
 * Builds the full set of in-scope entities for target resolution.
 * Includes items in the room, items in the player's inventory, and monsters in the room.
 */
function buildScopeEntities(worldDB: WorldDB, roomId: number): Entity[] {
  const scenery = worldDB.getSceneryForRoom(roomId);
  const roomItems = worldDB.getItemsInRoom(roomId);
  const inventory = worldDB.getPlayerInventory();
  const monsters = worldDB.getMonstersInRoom(roomId);

  const sceneryEntities: Entity[] = scenery.map((s) => ({
    id: s.id,
    name: s.name,
    kind: 'scenery' as const,
    inspectionDescription: s.inspection_description,
    roomBlurb: s.room_blurb,
  }));

  const roomItemEntities: Entity[] = roomItems.map(itemRowToEntity);
  const inventoryEntities: Entity[] = inventory.map(itemRowToEntity);
  const monsterEntities: Entity[] = monsters.map(monsterRowToEntity);

  return [...roomItemEntities, ...inventoryEntities, ...monsterEntities, ...sceneryEntities];
}

function itemRowToEntity(item: ItemRow): Entity {
  return {
    id: item.id,
    name: item.name,
    kind: 'item' as const,
    inspectionDescription: item.inspection_description,
    roomBlurb: item.room_blurb,
  };
}

/**
 * Resolves the original intent for a definitively-identified entity.
 * Used after disambiguation succeeds. Returns an array of narrative lines.
 */
async function resolveEntityIntentAsync(
  intentType: 'look_at' | 'take' | 'attack',
  entity: Entity,
  worldDB: WorldDB,
  logger?: EventLogger,
  refusals?: Record<string, string>,
): Promise<string[]> {
  if (intentType === 'look_at') {
    return [entity.inspectionDescription];
  }

  if (intentType === 'attack') {
    const monster = worldDB.getMonster(entity.id);
    if (!monster) return [_getRefusal('nothing_to_attack')];

    const attackResult = worldDB.attackMonster(monster.id, logger);
    const lines: string[] = [
      `You hit the ${monster.name} for ${attackResult.player_damage_dealt} damage.`,
    ];
    if (attackResult.monster_dead) {
      lines.push(`The ${monster.name} collapses.`);
    } else if (attackResult.monster_damage_dealt > 0) {
      lines.push(
        `The ${monster.name} strikes back for ${attackResult.monster_damage_dealt} damage.`,
      );
      if (attackResult.player_died) {
        const startRoom = worldDB.respawnPlayer(logger);
        lines.push('Everything goes black. You wake at the threshold.');
        lines.push(assembleBlurb(startRoom, {}));
      }
    }
    return lines;
  }

  // take
  if (entity.kind === 'scenery') {
    const override = refusals?.['cannot_take_scenery'];
    if (override) {
      return [emitRefusal('cannot_take_scenery', logger, refusals)];
    }
    const message = entity.roomBlurb || _getRefusal('cannot_take_scenery');
    logger?.logRefusal({ key: 'cannot_take_scenery', message, overridden: false });
    return [message];
  }
  if (entity.kind === 'item') {
    const inventory = worldDB.getPlayerInventory();
    const alreadyHave = inventory.find((i) => i.id === entity.id);
    if (alreadyHave) {
      return [`You already have the ${entity.name}.`];
    }
    const takenItem = worldDB.takeItem(entity.id, logger);
    let msg = `You take the ${takenItem.name}.`;
    const equipped = worldDB.getEquippedWeapon();
    if (equipped && equipped.id === takenItem.id) {
      msg += ' You wield it.';
    }
    return [msg];
  }
  return [_getRefusal('cannot_take_scenery')];
}

function monsterRowToEntity(monster: MonsterRow): Entity {
  return {
    id: monster.id,
    name: monster.name,
    kind: 'monster' as const,
    inspectionDescription: monster.inspection_description,
    roomBlurb: monster.room_blurb,
  };
}
