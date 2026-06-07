import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migration-runner';
import type { WorldFile } from './world-file-loader';
import { directionToOffset, reciprocalDirection, needsRetroBackExit } from './grid-topology';
import type { Coords } from './grid-topology';
import { generateRoom, LIMINAL_GAP_ROOM } from './room-generator';
import type { NeighborState } from './room-generator';
import { computeMonsterBounds, FIST_DAMAGE_MIN as BALANCE_FIST_MIN, FIST_DAMAGE_MAX as BALANCE_FIST_MAX } from './balance-calculator';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';
import type { MapData } from './shared/ipc';
import { selectBestWeapon, shouldAutoEquip, selectBestArmor, shouldAutoEquipArmor } from './auto-equip';
import type { WeaponCandidate, ArmorCandidate } from './auto-equip';
import { resolveCombat, FIST_DAMAGE_MIN, FIST_DAMAGE_MAX } from './combat-resolver';
import type { CombatResult } from './combat-resolver';

export interface Room {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  fixed_description: string;
  visited: number; // 0 = never entered by player, 1 = visited
}

export interface PlayerState {
  id: number;
  current_room_id: number;
  hp: number;
  max_hp: number;
  equipped_weapon_id: number | null;
  equipped_armor_id: number | null;
}

// ---------------------------------------------------------------------------
// MoveResult — outcome of a player movement attempt
// ---------------------------------------------------------------------------

export type MoveResult =
  | { ok: true; room: Room; generated: boolean; generationFailed?: boolean; hpRestored: number }
  | { ok: false; reason: 'no_exit' | 'generation_failed'; error?: string };

export interface SceneryRow {
  id: number;
  room_id: number;
  name: string;
  inspection_description: string;
  room_blurb: string;
}

export interface ItemRow {
  id: number;
  name: string;
  location: string;
  damage_min: number;
  damage_max: number;
  type: string;
  disturbed: number; // 0 = false, 1 = true (SQLite boolean)
  inspection_description: string;
  room_blurb: string;
  armor_value: number;
}

export interface MonsterRow {
  id: number;
  name: string;
  location: string;
  hp: number;
  max_hp: number;
  damage_min: number;
  damage_max: number;
  inspection_description: string;
  room_blurb: string;
  engaged: number; // 0 = false, 1 = true
}

export interface AttackResult extends CombatResult {
  /** Updated player HP after the exchange. */
  newPlayerHp: number;
  /** Updated monster HP after the exchange (0 if dead). */
  newMonsterHp: number;
}

export interface PartingHitResult {
  monster_damage_dealt: number;
  player_died: boolean;
  newPlayerHp: number;
}

export interface WorldDB {
  db: Database.Database;
  getCurrentRoom(): Room;
  /**
   * Attempt to move the player one step in `direction`.
   * - If the current room has no declared exit that way → MoveResult { ok: false, reason: 'no_exit' }
   * - If the exit leads to an existing room → move player, return that room
   * - If the exit leads to an unmapped coord → invoke the generator, commit the room, wire back-exit, move player
   */
  movePlayer(
    direction: string,
    llmFn: LLMFunction,
    logger?: EventLogger,
  ): Promise<MoveResult>;

  /** All canonical directions the current room declares as open exits. */
  getCurrentRoomExits(): string[];

  /** All scenery items for the given room, in insertion order. */
  getSceneryForRoom(roomId: number): SceneryRow[];

  /** All items in a given room (location = "room:<roomId>"). */
  getItemsInRoom(roomId: number): ItemRow[];

  /** All items in the player's inventory (location = "player_inventory"). */
  getPlayerInventory(): ItemRow[];

  /** The player's current state (HP, equipped weapon, etc.). */
  getPlayerState(): PlayerState;

  /** The currently equipped weapon item, or null if unarmed. */
  getEquippedWeapon(): ItemRow | null;

  /** The currently equipped armor item, or null if unarmored. */
  getEquippedArmor(): ItemRow | null;

  /**
   * Move an item from the current room to the player's inventory.
   * Sets disturbed = true and updates equipped_weapon_id if auto-equip applies.
   * Returns the item row that was taken.
   */
  takeItem(itemId: number, logger?: EventLogger): ItemRow;

  /**
   * Move an item from the player's inventory to the current room.
   * If the item was equipped, re-runs auto-equip selection and updates equipped_weapon_id.
   * Returns the item row that was dropped.
   */
  dropItem(itemId: number, logger?: EventLogger): ItemRow;

  /** All monsters alive in the given room (location = "room:<roomId>"). */
  getMonstersInRoom(roomId: number): MonsterRow[];

  /** The monster with the given ID, or undefined if not found. */
  getMonster(monsterId: number): MonsterRow | undefined;

  /**
   * Execute one ATTACK exchange against the given monster.
   * Applies HP deltas, sets monster engaged=1.
   * If monster dies: sets location to "dead:<id>", moves drop to "room:<roomId>".
   * If player dies: triggers respawn.
   */
  attackMonster(monsterId: number, logger?: EventLogger): AttackResult;

  /**
   * Execute a parting hit from all engaged monsters in the current room.
   * Called when the player moves out of a room with engaged monsters.
   * Returns the combined result (worst case for player).
   */
  applyPartingHits(logger?: EventLogger): PartingHitResult;

  /**
   * Respawn the player: reset HP to max_hp, move to starting room (0,0,0),
   * refill HP of all monsters that were ever engaged.
   */
  respawnPlayer(logger?: EventLogger): Room;

  /**
   * Fire-and-forget background generation for all unmapped exits of the current room.
   * Rooms are inserted into the DB so movePlayer() picks them up via loop closure.
   */
  preloadAdjacentRooms(llmFn: LLMFunction, logger?: EventLogger): void;

  /** All visited rooms on the given y-floor and the exits between them, for the map overlay. */
  getMapData(floor: number): MapData;
}

/**
 * Open (or create) the world database for a given world folder.
 *
 * @param worldDir  Absolute path to the world's directory (contains world.sqlite).
 * @param worldFile The parsed WorldFile whose starting_room should be inserted on first run.
 */
export function openWorldDB(worldDir: string, worldFile: WorldFile): WorldDB {
  fs.mkdirSync(worldDir, { recursive: true });

  const dbPath = path.join(worldDir, 'world.sqlite');
  const db = new Database(dbPath);

  // Enable WAL for better concurrency / crash safety
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  seedIfEmpty(db, worldFile);

  // Capture world body for use in generation prompts
  const worldBody = worldFile.body;

  // ── Prepared statements ──────────────────────────────────────────────────
  const stmtPlayerRoom = db.prepare('SELECT current_room_id FROM player_state WHERE id = 1');
  const stmtGetRoom = db.prepare('SELECT * FROM rooms WHERE id = ?');
  const stmtGetRoomByCoords = db.prepare('SELECT * FROM rooms WHERE x = ? AND y = ? AND z = ?');
  const stmtGetExit = db.prepare(
    'SELECT to_room_id FROM exits WHERE from_room_id = ? AND direction = ?',
  );
  const stmtGetExits = db.prepare('SELECT direction FROM exits WHERE from_room_id = ?');
  const stmtGetAllowedExits = db.prepare(
    'SELECT direction FROM room_allowed_exits WHERE room_id = ?',
  );
  const stmtInsertAllowedExit = db.prepare(
    'INSERT OR IGNORE INTO room_allowed_exits (room_id, direction) VALUES (?, ?)',
  );
  const stmtInsertRoom = db.prepare(
    'INSERT INTO rooms (name, x, y, z, fixed_description) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtInsertExit = db.prepare(
    'INSERT OR IGNORE INTO exits (from_room_id, direction, to_room_id) VALUES (?, ?, ?)',
  );
  const stmtUpdatePlayerRoom = db.prepare(
    'UPDATE player_state SET current_room_id = ? WHERE id = 1',
  );
  const stmtGetScenery = db.prepare(
    'SELECT id, room_id, name, inspection_description, room_blurb FROM scenery WHERE room_id = ? ORDER BY id ASC',
  );
  const stmtGetItemsInRoom = db.prepare(
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value FROM items WHERE location = ? ORDER BY id ASC',
  );
  const stmtGetInventory = db.prepare(
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value FROM items WHERE location = ? ORDER BY id ASC',
  );
  const stmtGetItem = db.prepare(
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value FROM items WHERE id = ?',
  );
  const stmtGetPlayerState = db.prepare('SELECT * FROM player_state WHERE id = 1');
  const stmtUpdateItemLocation = db.prepare('UPDATE items SET location = ?, disturbed = ? WHERE id = ?');
  const stmtUpdateEquippedWeapon = db.prepare('UPDATE player_state SET equipped_weapon_id = ? WHERE id = 1');
  const stmtUpdateEquippedArmor = db.prepare('UPDATE player_state SET equipped_armor_id = ? WHERE id = 1');
  const stmtGetMonstersInRoom = db.prepare(
    'SELECT id, name, location, hp, max_hp, damage_min, damage_max, inspection_description, room_blurb, engaged FROM monsters WHERE location = ? ORDER BY id ASC',
  );
  const stmtGetMonster = db.prepare(
    'SELECT id, name, location, hp, max_hp, damage_min, damage_max, inspection_description, room_blurb, engaged FROM monsters WHERE id = ?',
  );
  const stmtUpdateMonsterHp = db.prepare('UPDATE monsters SET hp = ? WHERE id = ?');
  const stmtUpdateMonsterLocation = db.prepare('UPDATE monsters SET location = ? WHERE id = ?');
  const stmtSetMonsterEngaged = db.prepare('UPDATE monsters SET engaged = ? WHERE id = ?');
  const stmtUpdatePlayerHp = db.prepare('UPDATE player_state SET hp = ? WHERE id = 1');
  const stmtGetStartingRoom = db.prepare('SELECT * FROM rooms WHERE x = 0 AND y = 0 AND z = 0');
  const stmtGetEngagedMonsters = db.prepare('SELECT id FROM monsters WHERE engaged = 1');
  const stmtRefillMonsterHp = db.prepare('UPDATE monsters SET hp = max_hp WHERE engaged = 1');
  const stmtClearAllEngaged = db.prepare('UPDATE monsters SET engaged = 0');
  const stmtGetDropForMonster = db.prepare(
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value FROM items WHERE location = ?',
  );
  const stmtMarkRoomVisited = db.prepare('UPDATE rooms SET visited = 1 WHERE id = ?');
  const stmtGetRoomVisited = db.prepare('SELECT visited FROM rooms WHERE id = ?');

  // ── Startup: seed exits from frontmatter for the starting room ───────────
  // The starting room was inserted without exits (they have no target room_id yet).
  // We leave them unmapped here — the movement engine creates exit rows on demand.

  function applyEntryHeal(destRoomId: number): number {
    const visitedRow = stmtGetRoomVisited.get(destRoomId) as { visited: number } | undefined;
    const isNew = !visitedRow || visitedRow.visited === 0;
    const player = stmtGetPlayerState.get() as PlayerState;
    const healAmount = Math.min(
      Math.floor(player.max_hp * (isNew ? 0.25 : 0.05)),
      player.max_hp - player.hp,
    );
    if (healAmount > 0) {
      stmtUpdatePlayerHp.run(player.hp + healAmount);
    }
    stmtMarkRoomVisited.run(destRoomId);
    return healAmount;
  }

  return {
    db,

    getCurrentRoom(): Room {
      const player = stmtPlayerRoom.get() as { current_room_id: number };
      return stmtGetRoom.get(player.current_room_id) as Room;
    },

    getCurrentRoomExits(): string[] {
      const player = stmtPlayerRoom.get() as { current_room_id: number };
      const rows = stmtGetAllowedExits.all(player.current_room_id) as { direction: string }[];
      return rows.map((r) => r.direction);
    },

    getSceneryForRoom(roomId: number): SceneryRow[] {
      return stmtGetScenery.all(roomId) as SceneryRow[];
    },

    getItemsInRoom(roomId: number): ItemRow[] {
      return stmtGetItemsInRoom.all(`room:${roomId}`) as ItemRow[];
    },

    getPlayerInventory(): ItemRow[] {
      return stmtGetInventory.all('player_inventory') as ItemRow[];
    },

    getPlayerState(): PlayerState {
      return stmtGetPlayerState.get() as PlayerState;
    },

    getEquippedWeapon(): ItemRow | null {
      const player = stmtGetPlayerState.get() as PlayerState;
      if (player.equipped_weapon_id == null) return null;
      const item = stmtGetItem.get(player.equipped_weapon_id) as ItemRow | undefined;
      return item ?? null;
    },

    getEquippedArmor(): ItemRow | null {
      const player = stmtGetPlayerState.get() as PlayerState;
      if (player.equipped_armor_id == null) return null;
      const item = stmtGetItem.get(player.equipped_armor_id) as ItemRow | undefined;
      return item ?? null;
    },

    takeItem(itemId: number, logger?: EventLogger): ItemRow {
      const item = stmtGetItem.get(itemId) as ItemRow;

      // Move item to inventory and mark as disturbed
      stmtUpdateItemLocation.run('player_inventory', 1, itemId);

      // Log item location change
      logger?.logStateMutate({
        entity: 'item',
        id: itemId,
        before: { location: item.location, disturbed: item.disturbed },
        after: { location: 'player_inventory', disturbed: 1 },
        reason: 'take',
      });

      // Auto-equip check
      const player = stmtGetPlayerState.get() as PlayerState;

      if (item.type === 'armor') {
        const equippedArmorId = player.equipped_armor_id;
        const currentArmor: ArmorCandidate | null = equippedArmorId
          ? (stmtGetItem.get(equippedArmorId) as ItemRow | undefined) ?? null
          : null;

        if (shouldAutoEquipArmor(currentArmor, item)) {
          stmtUpdateEquippedArmor.run(itemId);
          logger?.logStateMutate({
            entity: 'player',
            id: 1,
            before: { equipped_armor_id: equippedArmorId ?? null },
            after: { equipped_armor_id: itemId },
            reason: 'take_auto_equip_armor',
          });
        }
      } else {
        const equippedId = player.equipped_weapon_id;
        const currentWeapon: WeaponCandidate | null = equippedId
          ? (stmtGetItem.get(equippedId) as ItemRow | undefined) ?? null
          : null;

        if (shouldAutoEquip(currentWeapon, item)) {
          stmtUpdateEquippedWeapon.run(itemId);
          logger?.logStateMutate({
            entity: 'player',
            id: 1,
            before: { equipped_weapon_id: equippedId ?? null },
            after: { equipped_weapon_id: itemId },
            reason: 'take_auto_equip',
          });
        }
      }

      return { ...item, location: 'player_inventory', disturbed: 1 };
    },

    dropItem(itemId: number, logger?: EventLogger): ItemRow {
      const item = stmtGetItem.get(itemId) as ItemRow;
      const player = stmtGetPlayerState.get() as PlayerState;
      const currentRoomId = player.current_room_id;
      const newLocation = `room:${currentRoomId}`;

      // Move item to current room (disturbed stays true since it was previously taken)
      stmtUpdateItemLocation.run(newLocation, 1, itemId);

      // Log item location change
      logger?.logStateMutate({
        entity: 'item',
        id: itemId,
        before: { location: item.location },
        after: { location: newLocation },
        reason: 'drop',
      });

      // If this was the equipped weapon, re-run auto-equip selection
      if (player.equipped_weapon_id === itemId) {
        const remainingInventory = (
          stmtGetInventory.all('player_inventory') as ItemRow[]
        ).filter((i) => i.id !== itemId && i.type === 'weapon');

        const candidates: WeaponCandidate[] = remainingInventory.map((i) => ({
          id: i.id,
          damage_min: i.damage_min,
          damage_max: i.damage_max,
        }));
        const best = selectBestWeapon(candidates);
        const newEquippedId = best ? best.id : null;
        stmtUpdateEquippedWeapon.run(newEquippedId);

        logger?.logStateMutate({
          entity: 'player',
          id: 1,
          before: { equipped_weapon_id: player.equipped_weapon_id },
          after: { equipped_weapon_id: newEquippedId },
          reason: 'drop_re_equip',
        });
      }

      // If this was the equipped armor, re-run armor selection
      if (player.equipped_armor_id === itemId) {
        const remainingInventory = (
          stmtGetInventory.all('player_inventory') as ItemRow[]
        ).filter((i) => i.id !== itemId && i.type === 'armor');

        const armorCandidates: ArmorCandidate[] = remainingInventory.map((i) => ({
          id: i.id,
          armor_value: i.armor_value,
        }));
        const bestArmor = selectBestArmor(armorCandidates);
        const newArmorId = bestArmor ? bestArmor.id : null;
        stmtUpdateEquippedArmor.run(newArmorId);

        logger?.logStateMutate({
          entity: 'player',
          id: 1,
          before: { equipped_armor_id: player.equipped_armor_id },
          after: { equipped_armor_id: newArmorId },
          reason: 'drop_re_equip_armor',
        });
      }

      return { ...item, location: newLocation, disturbed: 1 };
    },

    getMonstersInRoom(roomId: number): MonsterRow[] {
      return stmtGetMonstersInRoom.all(`room:${roomId}`) as MonsterRow[];
    },

    getMonster(monsterId: number): MonsterRow | undefined {
      return stmtGetMonster.get(monsterId) as MonsterRow | undefined;
    },

    attackMonster(monsterId: number, logger?: EventLogger): AttackResult {
      const monster = stmtGetMonster.get(monsterId) as MonsterRow;
      const player = stmtGetPlayerState.get() as PlayerState;

      // Build player combat stats
      let playerDmgMin = FIST_DAMAGE_MIN;
      let playerDmgMax = FIST_DAMAGE_MAX;
      if (player.equipped_weapon_id != null) {
        const weapon = stmtGetItem.get(player.equipped_weapon_id) as ItemRow | undefined;
        if (weapon) {
          playerDmgMin = weapon.damage_min;
          playerDmgMax = weapon.damage_max;
        }
      }

      let playerArmorValue = 0;
      if (player.equipped_armor_id != null) {
        const armor = stmtGetItem.get(player.equipped_armor_id) as ItemRow | undefined;
        if (armor) playerArmorValue = armor.armor_value;
      }

      const combatResult = resolveCombat(
        { hp: player.hp, max_hp: player.max_hp, damage_min: playerDmgMin, damage_max: playerDmgMax, armor_value: playerArmorValue },
        { id: monster.id, hp: monster.hp, max_hp: monster.max_hp, damage_min: monster.damage_min, damage_max: monster.damage_max },
      );

      const newMonsterHp = Math.max(0, monster.hp - combatResult.player_damage_dealt);
      const newPlayerHp = Math.max(0, player.hp - combatResult.monster_damage_dealt);

      db.transaction(() => {
        // Mark monster as engaged
        stmtSetMonsterEngaged.run(1, monsterId);

        if (combatResult.monster_dead) {
          // Move monster to graveyard
          stmtUpdateMonsterHp.run(0, monsterId);
          stmtUpdateMonsterLocation.run(`dead:${monsterId}`, monsterId);

          // Move monster's drop from "monster:<id>" to "room:<roomId>"
          const drop = stmtGetDropForMonster.get(`monster:${monsterId}`) as ItemRow | undefined;
          if (drop) {
            stmtUpdateItemLocation.run(`room:${player.current_room_id}`, 0, drop.id);
          }
        } else {
          stmtUpdateMonsterHp.run(newMonsterHp, monsterId);
        }

        // Apply player damage
        stmtUpdatePlayerHp.run(newPlayerHp);

        if (combatResult.player_died) {
          // Respawn happens in the calling layer — handled by respawnPlayer()
        }
      })();

      // ── Log state mutations after transaction ───────────────────────────────
      // Monster engaged flag
      logger?.logStateMutate({
        entity: 'monster',
        id: monsterId,
        before: { engaged: monster.engaged },
        after: { engaged: 1 },
        reason: 'attack_engage',
      });

      if (combatResult.monster_dead) {
        // Monster HP → 0 and location → dead
        logger?.logStateMutate({
          entity: 'monster',
          id: monsterId,
          before: { hp: monster.hp, location: monster.location },
          after: { hp: 0, location: `dead:${monsterId}` },
          reason: 'monster_death',
        });

        // Drop item location
        const drop = stmtGetDropForMonster.get(`room:${player.current_room_id}`) as ItemRow | undefined;
        if (drop) {
          logger?.logStateMutate({
            entity: 'item',
            id: drop.id,
            before: { location: `monster:${monsterId}` },
            after: { location: `room:${player.current_room_id}` },
            reason: 'monster_death_drop',
          });
        }
      } else {
        logger?.logStateMutate({
          entity: 'monster',
          id: monsterId,
          before: { hp: monster.hp },
          after: { hp: newMonsterHp },
          reason: 'attack',
        });
      }

      // Player HP change
      logger?.logStateMutate({
        entity: 'player',
        id: 1,
        before: { hp: player.hp },
        after: { hp: newPlayerHp },
        reason: 'attack',
      });

      return {
        ...combatResult,
        newPlayerHp,
        newMonsterHp,
      };
    },

    applyPartingHits(logger?: EventLogger): PartingHitResult {
      const player = stmtGetPlayerState.get() as PlayerState;
      const engagedMonsters = stmtGetMonstersInRoom.all(`room:${player.current_room_id}`) as MonsterRow[];
      const activeEngaged = engagedMonsters.filter((m) => m.engaged === 1);

      if (activeEngaged.length === 0) {
        return { monster_damage_dealt: 0, player_died: false, newPlayerHp: player.hp };
      }

      // Look up armor for damage reduction
      let playerArmorValue = 0;
      if (player.equipped_armor_id != null) {
        const armor = stmtGetItem.get(player.equipped_armor_id) as ItemRow | undefined;
        if (armor) playerArmorValue = armor.armor_value;
      }

      // Each engaged monster gets a parting shot, reduced by armor
      let totalDamage = 0;
      for (const monster of activeEngaged) {
        const rawDmg = Math.floor(Math.random() * (monster.damage_max - monster.damage_min + 1)) + monster.damage_min;
        const dmg = Math.max(0, rawDmg - playerArmorValue);
        totalDamage += dmg;
      }

      const newPlayerHp = Math.max(0, player.hp - totalDamage);
      stmtUpdatePlayerHp.run(newPlayerHp);

      // Log player HP change from parting hits
      logger?.logStateMutate({
        entity: 'player',
        id: 1,
        before: { hp: player.hp },
        after: { hp: newPlayerHp },
        reason: 'parting_hit',
      });

      return {
        monster_damage_dealt: totalDamage,
        player_died: newPlayerHp <= 0,
        newPlayerHp,
      };
    },

    respawnPlayer(logger?: EventLogger): Room {
      const startingRoom = stmtGetStartingRoom.get() as Room;
      const playerBefore = stmtGetPlayerState.get() as PlayerState;
      const engagedMonstersBefore = stmtGetEngagedMonsters.all() as { id: number }[];

      db.transaction(() => {
        // Reset player HP and position
        db.prepare('UPDATE player_state SET hp = max_hp, current_room_id = ? WHERE id = 1').run(startingRoom.id);

        // Refill all engaged monsters
        stmtRefillMonsterHp.run();

        // Clear engaged flags
        stmtClearAllEngaged.run();
      })();

      // Log player HP reset
      logger?.logStateMutate({
        entity: 'player',
        id: 1,
        before: { hp: playerBefore.hp },
        after: { hp: playerBefore.max_hp },
        reason: 'respawn',
      });

      // Log player room reset
      logger?.logStateMutate({
        entity: 'player',
        id: 1,
        before: { current_room_id: playerBefore.current_room_id },
        after: { current_room_id: startingRoom.id },
        reason: 'respawn_room',
      });

      // Log HP refill for each engaged monster
      for (const { id: monsterId } of engagedMonstersBefore) {
        const monster = stmtGetMonster.get(monsterId) as MonsterRow | undefined;
        if (monster) {
          logger?.logStateMutate({
            entity: 'monster',
            id: monsterId,
            before: { hp: monster.hp, engaged: 1 },
            after: { hp: monster.max_hp, engaged: 0 },
            reason: 'respawn_monster_refill',
          });
        }
      }

      return startingRoom;
    },

    async movePlayer(
      direction: string,
      llmFn: LLMFunction,
      logger?: EventLogger,
    ): Promise<MoveResult> {
      const playerRow = stmtPlayerRoom.get() as { current_room_id: number };
      const fromRoomId = playerRow.current_room_id;
      const fromRoom = stmtGetRoom.get(fromRoomId) as Room;

      // ── 1. Check if the current room has a wired exit in this direction ──
      const exitRow = stmtGetExit.get(fromRoomId, direction) as
        | { to_room_id: number }
        | undefined;

      if (exitRow) {
        // Exit already exists → just move the player
        const toRoom = stmtGetRoom.get(exitRow.to_room_id) as Room;
        stmtUpdatePlayerRoom.run(toRoom.id);
        logger?.logStateMutate({
          entity: 'player',
          id: 1,
          before: { current_room_id: fromRoomId },
          after: { current_room_id: toRoom.id },
          reason: 'move',
        });
        const hpRestored = applyEntryHeal(toRoom.id);
        return { ok: true, room: toRoom, generated: false, hpRestored };
      }

      // ── 2. Is this direction a declared frontmatter exit? ────────────────
      // The starting room exits were declared in WORLD.md but not wired yet.
      // We allow movement in any of the 6 canonical directions from non-starting
      // rooms that were generated (they declare exits as part of generation).
      // For the starting room, we check if the direction is in the WorldFile exits.
      // Since world-db doesn't have a reference to WorldFile here, we use a
      // different strategy: allow any of the 6 directions to trigger generation.
      // This matches the issue spec: "moving through an unmapped exit...generates a new room."
      // (The check that an exit is "declared" will be enforced by the starting room
      //  having its exits listed in world-db's seed step — see seedStartingRoomExits.)

      // Check if this room has this direction declared as an allowed exit
      const allowedExitsForRoom = (
        db.prepare(
          'SELECT direction FROM room_allowed_exits WHERE room_id = ?',
        ).all(fromRoomId) as { direction: string }[]
      ).map((r) => r.direction);

      if (allowedExitsForRoom.length > 0 && !allowedExitsForRoom.includes(direction)) {
        return { ok: false, reason: 'no_exit' };
      }

      // If room has no declared exits at all (shouldn't happen but guard it)
      if (allowedExitsForRoom.length === 0) {
        return { ok: false, reason: 'no_exit' };
      }

      // ── 3. Compute target coordinates ────────────────────────────────────
      const offset = directionToOffset(direction);
      const targetCoords: Coords = {
        x: fromRoom.x + offset.x,
        y: fromRoom.y + offset.y,
        z: fromRoom.z + offset.z,
      };

      // ── 4. Check if a room already exists at target ──────────────────────
      const existingRoom = stmtGetRoomByCoords.get(
        targetCoords.x,
        targetCoords.y,
        targetCoords.z,
      ) as Room | undefined;

      if (existingRoom) {
        // ── Loop closure: wire exits and retro-add reciprocal back-exit ────
        const back = reciprocalDirection(direction);

        db.transaction(() => {
          // Wire the forward exit (current → existing)
          stmtInsertExit.run(fromRoomId, direction, existingRoom.id);

          // Retro-add the reciprocal back-exit if the existing room lacks it
          const existingRoomExits = new Set(
            (stmtGetExits.all(existingRoom.id) as { direction: string }[]).map((r) => r.direction),
          );
          if (needsRetroBackExit(existingRoomExits, back)) {
            stmtInsertExit.run(existingRoom.id, back, fromRoomId);
            stmtInsertAllowedExit.run(existingRoom.id, back);
          }
        })();

        stmtUpdatePlayerRoom.run(existingRoom.id);

        logger?.logStateMutate({
          entity: 'player',
          id: 1,
          before: { current_room_id: fromRoomId },
          after: { current_room_id: existingRoom.id },
          reason: 'move',
        });

        // Log the link event
        logger?.logGenRoom({
          room_id: existingRoom.id,
          coords: targetCoords,
          source: 'linked',
        });

        const hpRestoredLinked = applyEntryHeal(existingRoom.id);
        return { ok: true, room: existingRoom, generated: false, hpRestored: hpRestoredLinked };
      }

      // ── 5. Generate a new room ───────────────────────────────────────────
      // Allowable exits: all 6 canonical directions EXCEPT the forced back-exit
      const back = reciprocalDirection(direction);
      const ALL_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'];
      const allowableExits = ALL_DIRECTIONS.filter((d) => d !== back);

      // Compute neighbor state for each allowable direction
      const neighborState: NeighborState = {
        [back]: 'forced back-exit to previous room',
      };
      for (const d of allowableExits) {
        const dOffset = directionToOffset(d);
        const neighborCoords: Coords = {
          x: targetCoords.x + dOffset.x,
          y: targetCoords.y + dOffset.y,
          z: targetCoords.z + dOffset.z,
        };
        const neighborRoom = stmtGetRoomByCoords.get(
          neighborCoords.x,
          neighborCoords.y,
          neighborCoords.z,
        ) as Room | undefined;
        neighborState[d] = neighborRoom ? `existing room named ${neighborRoom.name}` : 'empty';
      }

      // Compute monster balance bounds using player's current equipped weapon
      const playerStateForGen = stmtGetPlayerState.get() as PlayerState;
      let genWeaponMin = BALANCE_FIST_MIN;
      let genWeaponMax = BALANCE_FIST_MAX;
      if (playerStateForGen.equipped_weapon_id != null) {
        const equippedForGen = stmtGetItem.get(playerStateForGen.equipped_weapon_id) as ItemRow | undefined;
        if (equippedForGen) {
          genWeaponMin = equippedForGen.damage_min;
          genWeaponMax = equippedForGen.damage_max;
        }
      }
      const monsterBounds = computeMonsterBounds(genWeaponMin, genWeaponMax, playerStateForGen.max_hp);

      const genResult = await generateRoom({
        coords: targetCoords,
        allowableExits,
        llmFn,
        context: {
          worldBody,
          previousRoomDescription: fromRoom.fixed_description,
          directionTraveled: direction,
          neighborState,
          monsterBounds,
        },
      });

      // ── 5b. Handle generation failure: insert Liminal Gap fallback ───────
      const roomToCommit = genResult.ok ? genResult.room : LIMINAL_GAP_ROOM;
      const generationFailed = !genResult.ok;

      if (generationFailed) {
        logger?.logError({
          message: 'Room generation failed — inserting Liminal Gap fallback',
          detail: genResult.ok ? undefined : genResult.error,
        });
      }

      // ── 6. Commit new room + exits to DB ─────────────────────────────────
      const commitTx = db.transaction(() => {
        const insertResult = stmtInsertRoom.run(
          roomToCommit.name,
          targetCoords.x,
          targetCoords.y,
          targetCoords.z,
          roomToCommit.fixed_description,
        );
        const newRoomId = insertResult.lastInsertRowid as number;

        // Forced back-exit
        stmtInsertExit.run(newRoomId, back, fromRoomId);

        // Outbound exit from the source room to the new room
        stmtInsertExit.run(fromRoomId, direction, newRoomId);

        // Record the allowed exits for the new room
        const stmtInsertAllowed = db.prepare(
          'INSERT OR IGNORE INTO room_allowed_exits (room_id, direction) VALUES (?, ?)',
        );
        // Include the back-exit (always allowed) and the generated exits
        const allNewRoomExits = [...new Set([back, ...roomToCommit.exits])];
        for (const d of allNewRoomExits) {
          stmtInsertAllowed.run(newRoomId, d);
        }

        // Persist generated scenery
        if (roomToCommit.scenery && roomToCommit.scenery.length > 0) {
          const stmtInsertScenery = db.prepare(
            'INSERT INTO scenery (room_id, name, description, inspection_description, room_blurb) VALUES (?, ?, ?, ?, ?)',
          );
          for (const s of roomToCommit.scenery) {
            stmtInsertScenery.run(newRoomId, s.name, s.inspection_description, s.inspection_description, s.room_blurb);
          }
        }

        // Persist generated items (weapons)
        if (roomToCommit.items && roomToCommit.items.length > 0) {
          const stmtInsertItem = db.prepare(
            'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          );
          for (const item of roomToCommit.items) {
            stmtInsertItem.run(
              item.name,
              item.inspection_description,
              `room:${newRoomId}`,
              item.damage_min,
              item.damage_max,
              item.type,
              0,
              item.inspection_description,
              item.room_blurb,
              0,
            );
          }
        }

        // Persist generated armor pieces
        if (roomToCommit.armor && roomToCommit.armor.length > 0) {
          const stmtInsertArmor = db.prepare(
            'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          );
          for (const piece of roomToCommit.armor) {
            stmtInsertArmor.run(
              piece.name,
              piece.inspection_description,
              `room:${newRoomId}`,
              0,
              0,
              piece.type,
              0,
              piece.inspection_description,
              piece.room_blurb,
              piece.armor_value,
            );
          }
        }

        // Persist generated monsters (and their drops)
        if (roomToCommit.monsters && roomToCommit.monsters.length > 0) {
          const stmtInsertMonster = db.prepare(
            'INSERT INTO monsters (name, location, hp, max_hp, damage_min, damage_max, inspection_description, room_blurb, engaged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
          );
          const stmtInsertDrop = db.prepare(
            'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          );
          for (const monster of roomToCommit.monsters) {
            const monsterResult = stmtInsertMonster.run(
              monster.name,
              `room:${newRoomId}`,
              monster.hp,
              monster.hp, // max_hp = generated hp
              monster.damage_min,
              monster.damage_max,
              monster.inspection_description,
              monster.room_blurb,
            );
            const monsterId = monsterResult.lastInsertRowid as number;

            // Persist the drop with location "monster:<id>"
            stmtInsertDrop.run(
              monster.drop.name,
              monster.drop.inspection_description,
              `monster:${monsterId}`,
              monster.drop.damage_min,
              monster.drop.damage_max,
              'weapon',
              0,
              monster.drop.inspection_description,
              monster.drop.room_blurb,
              0,
            );
          }
        }

        // Update player position
        stmtUpdatePlayerRoom.run(newRoomId);

        return newRoomId;
      });

      let newRoomId: number;
      try {
        newRoomId = commitTx() as number;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
        ) {
          // preloadAdjacentRooms committed this room while we were generating — link and move
          const racedRoom = stmtGetRoomByCoords.get(
            targetCoords.x,
            targetCoords.y,
            targetCoords.z,
          ) as Room | undefined;
          if (racedRoom) {
            db.transaction(() => {
              stmtInsertExit.run(fromRoomId, direction, racedRoom.id);
              const racedExits = new Set(
                (stmtGetExits.all(racedRoom.id) as { direction: string }[]).map((r) => r.direction),
              );
              if (needsRetroBackExit(racedExits, back)) {
                stmtInsertExit.run(racedRoom.id, back, fromRoomId);
                stmtInsertAllowedExit.run(racedRoom.id, back);
              }
              stmtUpdatePlayerRoom.run(racedRoom.id);
            })();
            logger?.logStateMutate({
              entity: 'player',
              id: 1,
              before: { current_room_id: fromRoomId },
              after: { current_room_id: racedRoom.id },
              reason: 'move',
            });
            logger?.logGenRoom({ room_id: racedRoom.id, coords: targetCoords, source: 'linked' });
            const hpRestoredRaced = applyEntryHeal(racedRoom.id);
            return { ok: true, room: racedRoom, generated: false, hpRestored: hpRestoredRaced };
          }
        }
        throw err;
      }

      // ── 7. Log the gen.room event and player move ─────────────────────────
      logger?.logGenRoom({
        room_id: newRoomId,
        coords: targetCoords,
        source: generationFailed ? 'stub' : 'llm',
      });

      if (roomToCommit.monsters && roomToCommit.monsters.length > 0) {
        logger?.logGenMonster({ room_id: newRoomId, count: roomToCommit.monsters.length });
      }

      if (roomToCommit.items && roomToCommit.items.length > 0) {
        logger?.logGenItem({ room_id: newRoomId, count: roomToCommit.items.length });
      }

      logger?.logStateMutate({
        entity: 'player',
        id: 1,
        before: { current_room_id: fromRoomId },
        after: { current_room_id: newRoomId },
        reason: 'move',
      });

      const newRoom = stmtGetRoom.get(newRoomId) as Room;
      const hpRestoredNew = applyEntryHeal(newRoomId);

      // Surface the liminal-gap indicator via the room's name so the renderer
      // can detect it and show the one-line notice.
      return {
        ok: true,
        room: newRoom,
        generated: true,
        generationFailed,
        hpRestored: hpRestoredNew,
      };
    },

    preloadAdjacentRooms(llmFn: LLMFunction, logger?: EventLogger): void {
      const playerRow = stmtPlayerRoom.get() as { current_room_id: number };
      const currentRoom = stmtGetRoom.get(playerRow.current_room_id) as Room;
      const allowedExits = (
        stmtGetAllowedExits.all(currentRoom.id) as { direction: string }[]
      ).map((r) => r.direction);

      const ALL_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'];

      for (const exitDir of allowedExits) {
        const offset = directionToOffset(exitDir);
        const targetCoords: Coords = {
          x: currentRoom.x + offset.x,
          y: currentRoom.y + offset.y,
          z: currentRoom.z + offset.z,
        };

        // Skip if a room already exists at this coordinate
        if (stmtGetRoomByCoords.get(targetCoords.x, targetCoords.y, targetCoords.z)) continue;

        const back = reciprocalDirection(exitDir);
        const allowableExits = ALL_DIRECTIONS.filter((d) => d !== back);

        // Build neighbor state snapshot at dispatch time
        const neighborState: NeighborState = {
          [back]: 'forced back-exit to previous room',
        };
        for (const d of allowableExits) {
          const dOffset = directionToOffset(d);
          const nCoords: Coords = {
            x: targetCoords.x + dOffset.x,
            y: targetCoords.y + dOffset.y,
            z: targetCoords.z + dOffset.z,
          };
          const nRoom = stmtGetRoomByCoords.get(nCoords.x, nCoords.y, nCoords.z) as Room | undefined;
          neighborState[d] = nRoom ? `existing room named ${nRoom.name}` : 'empty';
        }

        // Snapshot monster bounds at dispatch time
        const playerStateForGen = stmtGetPlayerState.get() as PlayerState;
        let genWeaponMin = BALANCE_FIST_MIN;
        let genWeaponMax = BALANCE_FIST_MAX;
        if (playerStateForGen.equipped_weapon_id != null) {
          const equippedForGen = stmtGetItem.get(playerStateForGen.equipped_weapon_id) as ItemRow | undefined;
          if (equippedForGen) {
            genWeaponMin = equippedForGen.damage_min;
            genWeaponMax = equippedForGen.damage_max;
          }
        }
        const monsterBounds = computeMonsterBounds(genWeaponMin, genWeaponMax, playerStateForGen.max_hp);

        // Fire generation in background — capture loop variables
        const capturedTargetCoords = { ...targetCoords };
        const capturedBack = back;
        const capturedAllowableExits = [...allowableExits];
        const capturedNeighborState = { ...neighborState };
        const capturedPreviousRoomDescription = currentRoom.fixed_description;
        const capturedExitDir = exitDir;

        void (async () => {
          // Re-check before calling the LLM — player may have already moved there
          if (stmtGetRoomByCoords.get(capturedTargetCoords.x, capturedTargetCoords.y, capturedTargetCoords.z)) return;

          try {
          const genResult = await generateRoom({
            coords: capturedTargetCoords,
            allowableExits: capturedAllowableExits,
            llmFn,
            context: {
              worldBody,
              previousRoomDescription: capturedPreviousRoomDescription,
              directionTraveled: capturedExitDir,
              neighborState: capturedNeighborState,
              monsterBounds,
            },
          });

          const roomToCommit = genResult.ok ? genResult.room : LIMINAL_GAP_ROOM;

          // Check again — movePlayer() may have generated this room while we awaited
          if (stmtGetRoomByCoords.get(capturedTargetCoords.x, capturedTargetCoords.y, capturedTargetCoords.z)) return;

          try {
            db.transaction(() => {
              const insertResult = stmtInsertRoom.run(
                roomToCommit.name,
                capturedTargetCoords.x,
                capturedTargetCoords.y,
                capturedTargetCoords.z,
                roomToCommit.fixed_description,
              );
              const newRoomId = insertResult.lastInsertRowid as number;

              const allNewRoomExits = [...new Set([capturedBack, ...roomToCommit.exits])];
              const stmtInsertAllowed = db.prepare(
                'INSERT OR IGNORE INTO room_allowed_exits (room_id, direction) VALUES (?, ?)',
              );
              for (const d of allNewRoomExits) {
                stmtInsertAllowed.run(newRoomId, d);
              }

              if (roomToCommit.scenery && roomToCommit.scenery.length > 0) {
                const stmtInsertScenery = db.prepare(
                  'INSERT INTO scenery (room_id, name, description, inspection_description, room_blurb) VALUES (?, ?, ?, ?, ?)',
                );
                for (const s of roomToCommit.scenery) {
                  stmtInsertScenery.run(newRoomId, s.name, s.inspection_description, s.inspection_description, s.room_blurb);
                }
              }

              if (roomToCommit.items && roomToCommit.items.length > 0) {
                const stmtInsertItem = db.prepare(
                  'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                );
                for (const item of roomToCommit.items) {
                  stmtInsertItem.run(
                    item.name,
                    item.inspection_description,
                    `room:${newRoomId}`,
                    item.damage_min,
                    item.damage_max,
                    item.type,
                    0,
                    item.inspection_description,
                    item.room_blurb,
                    0,
                  );
                }
              }

              if (roomToCommit.armor && roomToCommit.armor.length > 0) {
                const stmtInsertArmor = db.prepare(
                  'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                );
                for (const piece of roomToCommit.armor) {
                  stmtInsertArmor.run(
                    piece.name,
                    piece.inspection_description,
                    `room:${newRoomId}`,
                    0,
                    0,
                    piece.type,
                    0,
                    piece.inspection_description,
                    piece.room_blurb,
                    piece.armor_value,
                  );
                }
              }

              if (roomToCommit.monsters && roomToCommit.monsters.length > 0) {
                const stmtInsertMonster = db.prepare(
                  'INSERT INTO monsters (name, location, hp, max_hp, damage_min, damage_max, inspection_description, room_blurb, engaged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
                );
                const stmtInsertDrop = db.prepare(
                  'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                );
                for (const monster of roomToCommit.monsters) {
                  const monsterResult = stmtInsertMonster.run(
                    monster.name,
                    `room:${newRoomId}`,
                    monster.hp,
                    monster.hp,
                    monster.damage_min,
                    monster.damage_max,
                    monster.inspection_description,
                    monster.room_blurb,
                  );
                  const monsterId = monsterResult.lastInsertRowid as number;
                  stmtInsertDrop.run(
                    monster.drop.name,
                    monster.drop.inspection_description,
                    `monster:${monsterId}`,
                    monster.drop.damage_min,
                    monster.drop.damage_max,
                    'weapon',
                    0,
                    monster.drop.inspection_description,
                    monster.drop.room_blurb,
                    0,
                  );
                }
              }
            })();

            logger?.logGenRoom({
              room_id: (stmtGetRoomByCoords.get(capturedTargetCoords.x, capturedTargetCoords.y, capturedTargetCoords.z) as Room).id,
              coords: capturedTargetCoords,
              source: genResult.ok ? 'llm' : 'stub',
            });
          } catch {
            // UNIQUE constraint on (x, y, z): movePlayer() committed this room concurrently — no-op
          }
          } catch (err) {
            logger?.logError({
              message: `Background preload failed for ${capturedExitDir} (${capturedTargetCoords.x},${capturedTargetCoords.y},${capturedTargetCoords.z})`,
              detail: err instanceof Error ? err.message : String(err),
            });
          }
        })();
      }
    },

    getMapData(floor: number): MapData {
      const playerRow = stmtPlayerRoom.get() as { current_room_id: number };

      const rooms = db
        .prepare('SELECT id, name, x, z FROM rooms WHERE y = ? AND visited = 1')
        .all(floor) as { id: number; name: string; x: number; z: number }[];

      const exits = db
        .prepare(
          `SELECT e.from_room_id, e.direction
           FROM exits e
           JOIN rooms r1 ON e.from_room_id = r1.id
           JOIN rooms r2 ON e.to_room_id = r2.id
           WHERE r1.y = ? AND r2.y = ?
             AND e.direction IN ('north', 'south', 'east', 'west')`,
        )
        .all(floor, floor) as { from_room_id: number; direction: string }[];

      return {
        rooms,
        exits,
        current_room_id: playerRow.current_room_id,
        floor,
      };
    },
  };
}

function seedIfEmpty(db: Database.Database, worldFile: WorldFile): void {
  const roomCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM rooms').get() as { cnt: number }
  ).cnt;

  if (roomCount > 0) return;

  const sr = worldFile.startingRoom;

  // Insert starting room at (0, 0, 0)
  const result = db
    .prepare(
      'INSERT INTO rooms (name, x, y, z, fixed_description) VALUES (?, ?, ?, ?, ?)',
    )
    .run(sr.name, 0, 0, 0, sr.fixed_description);

  const roomId = result.lastInsertRowid as number;

  // Record the allowed exits for the starting room (from frontmatter)
  const stmtInsertAllowed = db.prepare(
    'INSERT OR IGNORE INTO room_allowed_exits (room_id, direction) VALUES (?, ?)',
  );
  for (const exit of sr.exits) {
    stmtInsertAllowed.run(roomId, exit);
  }

  // Insert any frontmatter-authored scenery
  if (sr.scenery) {
    const insertScenery = db.prepare(
      'INSERT INTO scenery (room_id, name, description, inspection_description, room_blurb) VALUES (?, ?, ?, ?, ?)',
    );
    for (const s of sr.scenery) {
      insertScenery.run(roomId, s.name, s.inspection_description, s.inspection_description, s.room_blurb);
    }
  }

  // Insert any frontmatter-authored items
  if (sr.items && sr.items.length > 0) {
    const insertItem = db.prepare(
      'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb, armor_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const item of sr.items) {
      insertItem.run(
        item.name,
        item.inspection_description,
        `room:${roomId}`,
        item.damage_min,
        item.damage_max,
        item.type,
        0,
        item.inspection_description,
        item.room_blurb,
        0,
      );
    }
  }

  // Insert any frontmatter-authored monsters (no drops — world authors control the starting experience directly)
  if (sr.monsters && sr.monsters.length > 0) {
    const insertMonster = db.prepare(
      'INSERT INTO monsters (name, location, hp, max_hp, damage_min, damage_max, inspection_description, room_blurb, engaged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
    );
    for (const monster of sr.monsters) {
      insertMonster.run(
        monster.name,
        `room:${roomId}`,
        monster.hp,
        monster.max_hp,
        monster.damage_min,
        monster.damage_max,
        monster.inspection_description,
        monster.room_blurb,
      );
    }
  }

  // Insert initial player state
  db.prepare(
    'INSERT INTO player_state (id, current_room_id, hp, max_hp, equipped_weapon_id, equipped_armor_id) VALUES (1, ?, 20, 20, NULL, NULL)',
  ).run(roomId);
}
