import type Database from 'better-sqlite3';

export const EXPECTED_SCHEMA_VERSION = 2;

const V1_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  fixed_description TEXT NOT NULL DEFAULT '',
  UNIQUE(x, y, z)
);

CREATE TABLE IF NOT EXISTS exits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_room_id INTEGER NOT NULL REFERENCES rooms(id),
  direction TEXT NOT NULL,
  to_room_id INTEGER NOT NULL REFERENCES rooms(id),
  UNIQUE(from_room_id, direction)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS monsters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id),
  name TEXT NOT NULL,
  hp INTEGER NOT NULL DEFAULT 10,
  max_hp INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS scenery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS player_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_room_id INTEGER NOT NULL REFERENCES rooms(id),
  hp INTEGER NOT NULL DEFAULT 20,
  max_hp INTEGER NOT NULL DEFAULT 20,
  equipped_weapon_id INTEGER REFERENCES items(id)
);
`;

/**
 * V2 adds the room_allowed_exits table.
 * This tracks which directions a room is allowed to open up into (for generation).
 * For the starting room, seeded from WORLD.md frontmatter exits.
 * For generated rooms, seeded from the generator response (filtered allowable exits).
 */
const V2_ADDITIONS = `
CREATE TABLE IF NOT EXISTS room_allowed_exits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  direction TEXT NOT NULL,
  UNIQUE(room_id, direction)
);
`;

export function runMigrations(db: Database.Database): void {
  // Check if schema_version exists
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();

  if (tableExists) {
    const row = db.prepare('SELECT version FROM schema_version').get() as
      | { version: number }
      | undefined;

    if (row && row.version > EXPECTED_SCHEMA_VERSION) {
      throw new Error(
        `schema_version ${row.version} is higher than expected ${EXPECTED_SCHEMA_VERSION}. ` +
          'This database was created by a newer version of the engine.',
      );
    }

    if (row && row.version === EXPECTED_SCHEMA_VERSION) {
      // Already at latest — apply all CREATE TABLE IF NOT EXISTS idempotently
      db.exec(V1_SCHEMA);
      db.exec(V2_ADDITIONS);
      return;
    }

    // V1 DB upgrading to V2
    if (row && row.version === 1) {
      db.exec(V2_ADDITIONS);
      db.prepare('UPDATE schema_version SET version = ?').run(EXPECTED_SCHEMA_VERSION);
      return;
    }
  }

  // Fresh DB — run full schema
  db.exec(V1_SCHEMA);
  db.exec(V2_ADDITIONS);

  // Seed schema_version if not set
  const existing = db.prepare('SELECT version FROM schema_version').get();
  if (!existing) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(EXPECTED_SCHEMA_VERSION);
  }
}
