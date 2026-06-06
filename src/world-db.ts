import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migration-runner';
import type { WorldFile } from './world-file-loader';

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

export interface WorldDB {
  db: Database.Database;
  getCurrentRoom(): Room;
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

  return {
    db,
    getCurrentRoom(): Room {
      const player = db
        .prepare('SELECT current_room_id FROM player_state WHERE id = 1')
        .get() as { current_room_id: number };

      return db
        .prepare('SELECT * FROM rooms WHERE id = ?')
        .get(player.current_room_id) as Room;
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

  // Insert exits from frontmatter — note: these are outbound only (destinations don't exist yet).
  // They are stored as references by direction so the movement engine can look them up.
  // In this slice, exits don't link to target rooms; that comes in issue 004.
  // We store exit directions as metadata on the room record later; for now the exits table
  // requires a to_room_id, so we skip pre-populating exits here. The movement engine will
  // generate rooms on demand (issue 004).

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
