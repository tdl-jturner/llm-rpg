import type Database from 'better-sqlite3';

export const EXPECTED_SCHEMA_VERSION = 5;

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

/**
 * V3 adds inspection_description and room_blurb columns to the scenery table.
 * - inspection_description: the full text returned by LOOK AT / EXAMINE / X
 * - room_blurb: the short blurb appended to LOOK output (permanent, never disappears)
 *
 * The original 'description' column is kept for backward compatibility
 * (existing rows will have inspection_description = '' until re-seeded).
 */
const V3_ADDITIONS = `
ALTER TABLE scenery ADD COLUMN inspection_description TEXT NOT NULL DEFAULT '';
ALTER TABLE scenery ADD COLUMN room_blurb TEXT NOT NULL DEFAULT '';
`;

/**
 * V4 extends the items table with full weapon stats and location semantics:
 * - location: "room:<id>", "player_inventory", or "monster:<id>"
 * - damage_min / damage_max: weapon damage range
 * - type: always "weapon" for now
 * - disturbed: 0=authored room_blurb should appear, 1=use deterministic template
 * - inspection_description: for LOOK AT / EXAMINE
 * - room_blurb: authored blurb shown in LOOK when item is in room + undisturbed
 *
 * The original room_id column is kept for backward compatibility (unused in v4+).
 */
const V4_ADDITIONS = `
ALTER TABLE items ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN damage_min INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN damage_max INTEGER NOT NULL DEFAULT 2;
ALTER TABLE items ADD COLUMN type TEXT NOT NULL DEFAULT 'weapon';
ALTER TABLE items ADD COLUMN disturbed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN inspection_description TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN room_blurb TEXT NOT NULL DEFAULT '';
`;

/**
 * V5 extends the monsters table with full combat stats and location semantics:
 * - location: "room:<id>" while alive, "dead:<id>" after death
 * - hp: current hit points
 * - max_hp: maximum hit points (for respawn)
 * - damage_min / damage_max: per-hit damage range
 * - inspection_description: for LOOK AT / EXAMINE
 * - room_blurb: blurb shown in LOOK while alive
 * - engaged: 1 if this monster has attacked the player (resets on player death)
 *
 * The original room_id column is kept for backward compatibility.
 */
const V5_ADDITIONS = `
ALTER TABLE monsters ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE monsters ADD COLUMN max_hp INTEGER NOT NULL DEFAULT 10;
ALTER TABLE monsters ADD COLUMN damage_min INTEGER NOT NULL DEFAULT 1;
ALTER TABLE monsters ADD COLUMN damage_max INTEGER NOT NULL DEFAULT 2;
ALTER TABLE monsters ADD COLUMN inspection_description TEXT NOT NULL DEFAULT '';
ALTER TABLE monsters ADD COLUMN room_blurb TEXT NOT NULL DEFAULT '';
ALTER TABLE monsters ADD COLUMN engaged INTEGER NOT NULL DEFAULT 0;
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
      // (ALTER TABLE IF NOT EXISTS is not supported; skip V3/V4/V5 re-runs since columns already exist)
      db.exec(V1_SCHEMA);
      db.exec(V2_ADDITIONS);
      return;
    }

    // V4 DB upgrading to V5
    if (row && row.version === 4) {
      applyV5Safely(db);
      db.prepare('UPDATE schema_version SET version = ?').run(EXPECTED_SCHEMA_VERSION);
      return;
    }

    // V3 DB upgrading to V4+V5
    if (row && row.version === 3) {
      applyV4Safely(db);
      applyV5Safely(db);
      db.prepare('UPDATE schema_version SET version = ?').run(EXPECTED_SCHEMA_VERSION);
      return;
    }

    // V2 DB upgrading to V3+V4+V5
    if (row && row.version === 2) {
      applyV3Safely(db);
      applyV4Safely(db);
      applyV5Safely(db);
      db.prepare('UPDATE schema_version SET version = ?').run(EXPECTED_SCHEMA_VERSION);
      return;
    }

    // V1 DB upgrading to V2+V3+V4+V5
    if (row && row.version === 1) {
      db.exec(V2_ADDITIONS);
      applyV3Safely(db);
      applyV4Safely(db);
      applyV5Safely(db);
      db.prepare('UPDATE schema_version SET version = ?').run(EXPECTED_SCHEMA_VERSION);
      return;
    }
  }

  // Fresh DB — run full schema
  db.exec(V1_SCHEMA);
  db.exec(V2_ADDITIONS);
  applyV3Safely(db);
  applyV4Safely(db);
  applyV5Safely(db);

  // Seed schema_version if not set
  const existing = db.prepare('SELECT version FROM schema_version').get();
  if (!existing) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(EXPECTED_SCHEMA_VERSION);
  }
}

/**
 * Applies schema changes safely — SQLite doesn't support IF NOT EXISTS for
 * ALTER TABLE ADD COLUMN, so we catch the "duplicate column" error and ignore it.
 */
function applyAltersSafely(db: Database.Database, additions: string): void {
  for (const sql of additions.trim().split(';\n').filter(Boolean)) {
    try {
      db.exec(sql + ';');
    } catch (err) {
      // Ignore "duplicate column name" errors (column already added in a previous run)
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column name')) {
        throw err;
      }
    }
  }
}

function applyV3Safely(db: Database.Database): void {
  applyAltersSafely(db, V3_ADDITIONS);
}

function applyV4Safely(db: Database.Database): void {
  applyAltersSafely(db, V4_ADDITIONS);
}

function applyV5Safely(db: Database.Database): void {
  applyAltersSafely(db, V5_ADDITIONS);
}
