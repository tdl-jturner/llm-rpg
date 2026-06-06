import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migration-runner';
import type { WorldFile } from './world-file-loader';
import { directionToOffset, reciprocalDirection, needsRetroBackExit } from './grid-topology';
import type { Coords } from './grid-topology';
import { generateRoom, LIMINAL_GAP_ROOM } from './room-generator';
import type { NeighborState } from './room-generator';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';
import { selectBestWeapon, shouldAutoEquip } from './auto-equip';
import type { WeaponCandidate } from './auto-equip';

export interface Room {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  fixed_description: string;
}

export interface PlayerState {
  id: number;
  current_room_id: number;
  hp: number;
  max_hp: number;
  equipped_weapon_id: number | null;
}

// ---------------------------------------------------------------------------
// MoveResult — outcome of a player movement attempt
// ---------------------------------------------------------------------------

export type MoveResult =
  | { ok: true; room: Room; generated: boolean; generationFailed?: boolean }
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

  /**
   * Move an item from the current room to the player's inventory.
   * Sets disturbed = true and updates equipped_weapon_id if auto-equip applies.
   * Returns the item row that was taken.
   */
  takeItem(itemId: number): ItemRow;

  /**
   * Move an item from the player's inventory to the current room.
   * If the item was equipped, re-runs auto-equip selection and updates equipped_weapon_id.
   * Returns the item row that was dropped.
   */
  dropItem(itemId: number): ItemRow;
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
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb FROM items WHERE location = ? ORDER BY id ASC',
  );
  const stmtGetInventory = db.prepare(
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb FROM items WHERE location = ? ORDER BY id ASC',
  );
  const stmtGetItem = db.prepare(
    'SELECT id, name, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb FROM items WHERE id = ?',
  );
  const stmtGetPlayerState = db.prepare('SELECT * FROM player_state WHERE id = 1');
  const stmtUpdateItemLocation = db.prepare('UPDATE items SET location = ?, disturbed = ? WHERE id = ?');
  const stmtUpdateEquippedWeapon = db.prepare('UPDATE player_state SET equipped_weapon_id = ? WHERE id = 1');

  // ── Startup: seed exits from frontmatter for the starting room ───────────
  // The starting room was inserted without exits (they have no target room_id yet).
  // We leave them unmapped here — the movement engine creates exit rows on demand.

  return {
    db,

    getCurrentRoom(): Room {
      const player = stmtPlayerRoom.get() as { current_room_id: number };
      return stmtGetRoom.get(player.current_room_id) as Room;
    },

    getCurrentRoomExits(): string[] {
      const player = stmtPlayerRoom.get() as { current_room_id: number };
      const rows = stmtGetExits.all(player.current_room_id) as { direction: string }[];
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

    takeItem(itemId: number): ItemRow {
      const item = stmtGetItem.get(itemId) as ItemRow;

      // Move item to inventory and mark as disturbed
      stmtUpdateItemLocation.run('player_inventory', 1, itemId);

      // Auto-equip check
      const player = stmtGetPlayerState.get() as PlayerState;
      const equippedId = player.equipped_weapon_id;
      const currentWeapon: WeaponCandidate | null = equippedId
        ? (stmtGetItem.get(equippedId) as ItemRow | undefined) ?? null
        : null;

      if (shouldAutoEquip(currentWeapon, item)) {
        stmtUpdateEquippedWeapon.run(itemId);
      }

      return { ...item, location: 'player_inventory', disturbed: 1 };
    },

    dropItem(itemId: number): ItemRow {
      const item = stmtGetItem.get(itemId) as ItemRow;
      const player = stmtGetPlayerState.get() as PlayerState;
      const currentRoomId = player.current_room_id;

      // Move item to current room (disturbed stays true since it was previously taken)
      stmtUpdateItemLocation.run(`room:${currentRoomId}`, 1, itemId);

      // If this was the equipped weapon, re-run auto-equip selection
      if (player.equipped_weapon_id === itemId) {
        const remainingInventory = (
          stmtGetInventory.all('player_inventory') as ItemRow[]
        ).filter((i) => i.id !== itemId);

        const candidates: WeaponCandidate[] = remainingInventory.map((i) => ({
          id: i.id,
          damage_min: i.damage_min,
          damage_max: i.damage_max,
        }));
        const best = selectBestWeapon(candidates);
        stmtUpdateEquippedWeapon.run(best ? best.id : null);
      }

      return { ...item, location: `room:${currentRoomId}`, disturbed: 1 };
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
        return { ok: true, room: toRoom, generated: false };
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
          }
        })();

        stmtUpdatePlayerRoom.run(existingRoom.id);

        // Log the link event
        logger?.logGenRoom({
          room_id: existingRoom.id,
          coords: targetCoords,
          source: 'linked',
        });

        return { ok: true, room: existingRoom, generated: false };
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

      const genResult = await generateRoom({
        coords: targetCoords,
        allowableExits,
        llmFn,
        context: {
          worldBody,
          previousRoomDescription: fromRoom.fixed_description,
          directionTraveled: direction,
          neighborState,
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

        // Persist generated items
        if (roomToCommit.items && roomToCommit.items.length > 0) {
          const stmtInsertItem = db.prepare(
            'INSERT INTO items (name, description, location, damage_min, damage_max, type, disturbed, inspection_description, room_blurb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
            );
          }
        }

        // Update player position
        stmtUpdatePlayerRoom.run(newRoomId);

        return newRoomId;
      });

      const newRoomId = commitTx() as number;

      // ── 7. Log the gen.room event ─────────────────────────────────────────
      logger?.logGenRoom({
        room_id: newRoomId,
        coords: targetCoords,
        source: generationFailed ? 'stub' : 'llm',
      });

      const newRoom = stmtGetRoom.get(newRoomId) as Room;

      // Surface the liminal-gap indicator via the room's name so the renderer
      // can detect it and show the one-line notice.
      return {
        ok: true,
        room: newRoom,
        generated: true,
        generationFailed,
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

  // Insert initial player state
  db.prepare(
    'INSERT INTO player_state (id, current_room_id, hp, max_hp, equipped_weapon_id) VALUES (1, ?, 20, 20, NULL)',
  ).run(roomId);
}
