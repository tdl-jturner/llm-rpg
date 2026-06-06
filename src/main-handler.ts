import type { SubmitInputResponse } from './shared/ipc';
import { parseIntent } from './intent-parser';
import { assembleBlurb } from './blurb-assembler';
import { getRefusal } from './refusal-bank';
import { resolveTarget } from './target-resolver';
import type { Entity } from './target-resolver';
import type { WorldDB, ItemRow } from './world-db';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';

/**
 * Disambiguation state — persisted between calls while the player is resolving
 * an ambiguous target. Cleared after one resolution attempt (success or failure).
 */
interface DisambiguationState {
  candidates: Entity[];
  /** The original intent that triggered disambiguation ('look_at' | 'take') */
  pendingIntent: 'look_at' | 'take';
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

export async function handleSubmitInput(
  text: string,
  worldDB?: WorldDB,
  llmFn?: LLMFunction,
  logger?: EventLogger,
): Promise<SubmitInputResponse> {
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
      return { narrative: [`> ${text}`, resolveEntityIntent(saved.pendingIntent, picked, worldDB)] };
    } else {
      // Invalid pick — cancel disambiguation and treat as fresh input
      // Fall through to normal intent parsing below
    }
  }

  const intent = parseIntent(text);
  const narrative: string[] = [`> ${text}`];

  switch (intent.type) {
    case 'look': {
      const room = worldDB.getCurrentRoom();
      const scenery = worldDB.getSceneryForRoom(room.id);
      const items = worldDB.getItemsInRoom(room.id);
      narrative.push(assembleBlurb(room, {
        items: items.map((i) => ({ name: i.name, room_blurb: i.room_blurb, disturbed: i.disturbed === 1 })),
        scenery,
      }));
      break;
    }

    case 'look_at': {
      const room = worldDB.getCurrentRoom();
      const entities = buildScopeEntities(worldDB, room.id);

      const result = resolveTarget(intent.target, entities);

      if (result.type === 'no_match') {
        narrative.push(getRefusal('nothing_here_named'));
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
        narrative.push(getRefusal('nothing_here_named'));
      } else if (result.type === 'unique') {
        const entity = result.entity;

        if (entity.kind === 'scenery') {
          // Cannot take scenery — show the scenery's room_blurb as the refusal body
          narrative.push(entity.roomBlurb || getRefusal('cannot_take_scenery'));
        } else if (entity.kind === 'item') {
          // Check if the item is already in inventory
          const inventory = worldDB.getPlayerInventory();
          const alreadyHave = inventory.find((i) => i.id === entity.id);
          if (alreadyHave) {
            narrative.push(`You already have the ${entity.name}.`);
          } else {
            const takenItem = worldDB.takeItem(entity.id);
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
        narrative.push(getRefusal('cant_drop_what_you_dont_have'));
      } else if (result.type === 'unique') {
        const droppedItem = worldDB.dropItem(result.entity.id);
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
        narrative.push(getRefusal('inventory_empty'));
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
      if (!llmFn) {
        // No LLM function provided — refuse movement (shouldn't happen at runtime)
        narrative.push(getRefusal('no_exit'));
        break;
      }

      const result = await worldDB.movePlayer(intent.direction, llmFn, logger);

      if (!result.ok) {
        if (result.reason === 'no_exit') {
          narrative.push(getRefusal('no_exit'));
        } else {
          // generation_failed (legacy path — currently unreachable since world-db
          // now falls back to the Liminal Gap room rather than returning this error)
          narrative.push(`Generation failed: ${result.error ?? 'unknown error'}`);
        }
      } else {
        const room = result.room;
        const scenery = worldDB.getSceneryForRoom(room.id);
        const items = worldDB.getItemsInRoom(room.id);
        narrative.push(assembleBlurb(room, {
          items: items.map((i) => ({ name: i.name, room_blurb: i.room_blurb, disturbed: i.disturbed === 1 })),
          scenery,
        }));
        if (result.generationFailed) {
          narrative.push('(World generation hiccup logged.)');
        }
      }
      break;
    }

    case 'unknown':
    default: {
      narrative.push(getRefusal('intent_unparseable'));
      break;
    }
  }

  return { narrative };
}

/**
 * Builds the full set of in-scope entities for target resolution.
 * Includes items in the room AND items in the player's inventory (for LOOK AT).
 */
function buildScopeEntities(worldDB: WorldDB, roomId: number): Entity[] {
  const scenery = worldDB.getSceneryForRoom(roomId);
  const roomItems = worldDB.getItemsInRoom(roomId);
  const inventory = worldDB.getPlayerInventory();

  const sceneryEntities: Entity[] = scenery.map((s) => ({
    id: s.id,
    name: s.name,
    kind: 'scenery' as const,
    inspectionDescription: s.inspection_description,
    roomBlurb: s.room_blurb,
  }));

  const roomItemEntities: Entity[] = roomItems.map(itemRowToEntity);
  const inventoryEntities: Entity[] = inventory.map(itemRowToEntity);

  return [...roomItemEntities, ...inventoryEntities, ...sceneryEntities];
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
 * Used after disambiguation succeeds.
 */
function resolveEntityIntent(intentType: 'look_at' | 'take', entity: Entity, worldDB: WorldDB): string {
  if (intentType === 'look_at') {
    return entity.inspectionDescription;
  }
  // take
  if (entity.kind === 'scenery') {
    return entity.roomBlurb || getRefusal('cannot_take_scenery');
  }
  if (entity.kind === 'item') {
    const inventory = worldDB.getPlayerInventory();
    const alreadyHave = inventory.find((i) => i.id === entity.id);
    if (alreadyHave) {
      return `You already have the ${entity.name}.`;
    }
    const takenItem = worldDB.takeItem(entity.id);
    let msg = `You take the ${takenItem.name}.`;
    const equipped = worldDB.getEquippedWeapon();
    if (equipped && equipped.id === takenItem.id) {
      msg += ' You wield it.';
    }
    return msg;
  }
  return getRefusal('cannot_take_scenery');
}
