import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, EXPECTED_SCHEMA_VERSION } from './migration-runner';

describe('MigrationRunner', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('creates all tables (v1 + v2 + v3) in a fresh in-memory DB', () => {
    db = new Database(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toContain('schema_version');
    expect(names).toContain('rooms');
    expect(names).toContain('exits');
    expect(names).toContain('items');
    expect(names).toContain('monsters');
    expect(names).toContain('scenery');
    expect(names).toContain('player_state');
    expect(names).toContain('room_allowed_exits');
  });

  it('sets schema_version to 3 after migration', () => {
    db = new Database(':memory:');
    runMigrations(db);

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('is idempotent — running twice does not throw', () => {
    db = new Database(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('throws if schema_version is higher than expected', () => {
    db = new Database(':memory:');
    runMigrations(db);
    // Manually bump version to simulate a future DB
    db.prepare('UPDATE schema_version SET version = ?').run(EXPECTED_SCHEMA_VERSION + 1);

    expect(() => runMigrations(db)).toThrow(/schema_version/i);
  });
});
