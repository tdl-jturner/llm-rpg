import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openWorldDB } from './world-db';
import type { WorldFile } from './world-file-loader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorldFile(overrides: Partial<WorldFile['startingRoom']> = {}): WorldFile {
  return {
    title: 'Test World',
    body: 'A test world.',
    startingRoom: {
      name: 'The Cave',
      fixed_description: 'A damp cave.',
      exits: ['north'],
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('seedIfEmpty — starting-room items and monsters', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-db-seed-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Tracer bullet ──────────────────────────────────────────────────────────

  it('items are inserted into the starting room', () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Rusty Sword',
          inspection_description: 'A corroded blade.',
          room_blurb: 'A rusty sword lies here.',
          damage_min: 1,
          damage_max: 3,
          type: 'weapon',
        },
      ],
    });

    const db = openWorldDB(tmpDir, worldFile);

    const items = db.getItemsInRoom(1);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Rusty Sword');
    expect(items[0].damage_min).toBe(1);
    expect(items[0].damage_max).toBe(3);
    expect(items[0].type).toBe('weapon');
    expect(items[0].location).toBe('room:1');
    expect(items[0].disturbed).toBe(0);

    db.db.close();
  });

  // ── TAKE works on seeded item ───────────────────────────────────────────

  it('TAKE works on a starting-room item', () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Rusty Sword',
          inspection_description: 'A corroded blade.',
          room_blurb: 'A rusty sword lies here.',
          damage_min: 1,
          damage_max: 3,
          type: 'weapon',
        },
      ],
    });

    const db = openWorldDB(tmpDir, worldFile);

    const items = db.getItemsInRoom(1);
    expect(items).toHaveLength(1);

    db.takeItem(items[0].id);

    const inventory = db.getPlayerInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('Rusty Sword');
    expect(db.getItemsInRoom(1)).toHaveLength(0);

    db.db.close();
  });

  // ── Monsters inserted ──────────────────────────────────────────────────

  it('monsters are inserted into the starting room', () => {
    const worldFile = makeWorldFile({
      monsters: [
        {
          name: 'Cave Rat',
          inspection_description: 'A scrawny rat.',
          room_blurb: 'A cave rat lurks here.',
          hp: 5,
          max_hp: 5,
          damage_min: 1,
          damage_max: 2,
        },
      ],
    });

    const db = openWorldDB(tmpDir, worldFile);

    const monsters = db.getMonstersInRoom(1);
    expect(monsters).toHaveLength(1);
    expect(monsters[0].name).toBe('Cave Rat');
    expect(monsters[0].hp).toBe(5);
    expect(monsters[0].max_hp).toBe(5);
    expect(monsters[0].damage_min).toBe(1);
    expect(monsters[0].damage_max).toBe(2);
    expect(monsters[0].location).toBe('room:1');
    expect(monsters[0].engaged).toBe(0);

    db.db.close();
  });

  // ── No regression: empty world ────────────────────────────────────────

  it('world with no items/monsters leaves room empty', () => {
    const worldFile = makeWorldFile(); // no items, no monsters

    const db = openWorldDB(tmpDir, worldFile);

    expect(db.getItemsInRoom(1)).toHaveLength(0);
    expect(db.getMonstersInRoom(1)).toHaveLength(0);

    db.db.close();
  });

  // ── No regression: scenery still seeded ──────────────────────────────

  it('existing scenery is still seeded correctly', () => {
    const worldFile = makeWorldFile({
      scenery: [
        {
          name: 'Ancient Altar',
          inspection_description: 'An ancient stone altar, covered in runes.',
          room_blurb: 'An ancient altar dominates the centre of the room.',
        },
      ],
    });

    const db = openWorldDB(tmpDir, worldFile);

    const scenery = db.getSceneryForRoom(1);
    expect(scenery).toHaveLength(1);
    expect(scenery[0].name).toBe('Ancient Altar');

    db.db.close();
  });
});
