import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migration-runner';

const STARTING_ROOM = {
  name: 'The Beginning',
  x: 0,
  y: 0,
  z: 0,
  fixed_description:
    'You stand in a small stone chamber. Rough-hewn walls press close on every side. ' +
    'A single torch flickers in a rusted bracket, casting long shadows across the floor. ' +
    'This is where your journey begins.',
};

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

export function openWorldDB(userDataPath: string): WorldDB {
  const worldDir = path.join(userDataPath, 'worlds', '_dev');
  fs.mkdirSync(worldDir, { recursive: true });

  const dbPath = path.join(worldDir, 'world.sqlite');
  const db = new Database(dbPath);

  // Enable WAL for better concurrency / crash safety
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  seedIfEmpty(db);

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

function seedIfEmpty(db: Database.Database): void {
  const roomCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM rooms').get() as { cnt: number }
  ).cnt;

  if (roomCount > 0) return;

  // Insert starting room
  const result = db
    .prepare(
      'INSERT INTO rooms (name, x, y, z, fixed_description) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      STARTING_ROOM.name,
      STARTING_ROOM.x,
      STARTING_ROOM.y,
      STARTING_ROOM.z,
      STARTING_ROOM.fixed_description,
    );

  const roomId = result.lastInsertRowid as number;

  // Insert initial player state
  db.prepare(
    'INSERT INTO player_state (id, current_room_id, hp, max_hp, equipped_weapon_id) VALUES (1, ?, 20, 20, NULL)',
  ).run(roomId);
}
