import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migration-runner';
import type { WorldFile } from './world-file-loader';
import { directionToOffset, reciprocalDirection } from './grid-topology';
import type { Coords } from './grid-topology';
import { generateRoom } from './room-generator';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';

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
  | { ok: true; room: Room; generated: boolean }
  | { ok: false; reason: 'no_exit' | 'generation_failed'; error?: string };

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
        // Wire the exit and move player
        stmtInsertExit.run(fromRoomId, direction, existingRoom.id);
        stmtUpdatePlayerRoom.run(existingRoom.id);
        return { ok: true, room: existingRoom, generated: false };
      }

      // ── 5. Generate a new room ───────────────────────────────────────────
      // Allowable exits: all 6 canonical directions EXCEPT the forced back-exit
      const back = reciprocalDirection(direction);
      const ALL_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'];
      const allowableExits = ALL_DIRECTIONS.filter((d) => d !== back);

      const genResult = await generateRoom({
        coords: targetCoords,
        allowableExits,
        llmFn,
      });

      if (!genResult.ok) {
        return { ok: false, reason: 'generation_failed', error: genResult.error };
      }

      // ── 6. Commit new room + exits to DB ─────────────────────────────────
      const commitTx = db.transaction(() => {
        const insertResult = stmtInsertRoom.run(
          genResult.room.name,
          targetCoords.x,
          targetCoords.y,
          targetCoords.z,
          genResult.room.fixed_description,
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
        const allNewRoomExits = [...new Set([back, ...genResult.room.exits])];
        for (const d of allNewRoomExits) {
          stmtInsertAllowed.run(newRoomId, d);
        }

        // Update player position
        stmtUpdatePlayerRoom.run(newRoomId);

        return newRoomId;
      });

      const newRoomId = commitTx() as number;

      // ── 7. Log the event ─────────────────────────────────────────────────
      logger?.logGenRoom({
        room_id: newRoomId,
        coords: targetCoords,
        source: 'stub',
      });

      const newRoom = stmtGetRoom.get(newRoomId) as Room;
      return { ok: true, room: newRoom, generated: true };
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
      'INSERT INTO scenery (room_id, name, description) VALUES (?, ?, ?)',
    );
    for (const s of sr.scenery) {
      insertScenery.run(roomId, s.name, s.inspection_description);
    }
  }

  // Insert initial player state
  db.prepare(
    'INSERT INTO player_state (id, current_room_id, hp, max_hp, equipped_weapon_id) VALUES (1, ?, 20, 20, NULL)',
  ).run(roomId);
}
