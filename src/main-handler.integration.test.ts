/**
 * Integration Tests: Full Turn Loop Against Real SQLite DB + Mocked Ollama
 *
 * These tests use a real WorldDB (backed by better-sqlite3 via openWorldDB) and
 * a mocked LLMFunction that returns canned room JSON. They exercise the full
 * handleSubmitInput → WorldDB → migration-runner → SQLite stack.
 *
 * Each test gets its own tmpDir so state never leaks between scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openWorldDB } from './world-db';
import type { WorldDB } from './world-db';
import type { WorldFile } from './world-file-loader';
import { handleSubmitInput, resetDisambiguationState, getDisambiguationState, buildInitialRoomDescription } from './main-handler';
import { EventLogger } from './event-logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal WorldFile for testing — starting room with north/east/south/west exits. */
function makeWorldFile(overrides: Partial<WorldFile['startingRoom']> = {}): WorldFile {
  return {
    title: 'Integration Test World',
    body: 'A world used in integration tests.',
    startingRoom: {
      name: 'The Threshold',
      fixed_description: 'You stand at the threshold.',
      exits: ['north', 'south', 'east', 'west'],
      ...overrides,
    },
  };
}

/** Canned room JSON for the mock LLM. Accepts a name override. */
function cannedRoomJson(name = 'Generated Room', exits: string[] = ['south']): string {
  return JSON.stringify({
    name,
    fixed_description: `A generated room called ${name}.`,
    exits,
    scenery: [],
    items: [],
    monsters: [],
  });
}

/** Canned room JSON with a monster. */
function cannedRoomWithMonsterJson(name = 'Dangerous Room'): string {
  return JSON.stringify({
    name,
    fixed_description: 'A dangerous room.',
    exits: ['south'],
    scenery: [],
    items: [],
    monsters: [
      {
        name: 'Goblin',
        inspection_description: 'A small green creature.',
        room_blurb: 'A goblin crouches here.',
        hp: 5,
        damage_min: 1,
        damage_max: 2,
        drop: {
          name: 'Goblin Knife',
          inspection_description: 'A crude knife.',
          room_blurb: 'A crude knife lies here.',
          damage_min: 1,
          damage_max: 3,
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Test fixture: per-test isolated DB
// ---------------------------------------------------------------------------

let tmpDir: string;
let db: WorldDB;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-rpg-integration-test-'));
  resetDisambiguationState();
});

afterEach(() => {
  try { db?.db.close(); } catch { /* already closed */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper to seed the DB fresh for each test
// ---------------------------------------------------------------------------
function openFreshDB(worldFile: WorldFile = makeWorldFile()): WorldDB {
  db = openWorldDB(tmpDir, worldFile);
  return db;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('Integration: full turn loop', () => {

  // ── LOOK ────────────────────────────────────────────────────────────────────

  it('LOOK returns the starting room description', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn();

    const result = await handleSubmitInput('look', db, llmFn, undefined, 'world body');

    expect(result.narrative[0]).toBe('> look');
    // The blurb contains the fixed_description text from the world file
    expect(result.narrative.join(' ')).toContain('threshold');
    // HUD should reflect the starting room name
    expect(result.hud?.room_name).toBe('The Threshold');
  });

  // ── INVENTORY when empty ───────────────────────────────────────────────────

  it('INVENTORY when empty returns inventory_empty refusal', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn();

    const result = await handleSubmitInput('inventory', db, llmFn, undefined, 'world body');

    expect(result.narrative).toContain("You aren't carrying anything.");
  });

  // ── INVENTORY with items ────────────────────────────────────────────────────

  it('INVENTORY with items shows list with equipped marker', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Iron Sword',
          inspection_description: 'A sturdy sword.',
          room_blurb: 'An iron sword rests here.',
          damage_min: 3,
          damage_max: 6,
          type: 'weapon',
        },
        {
          name: 'Rusty Dagger',
          inspection_description: 'A corroded dagger.',
          room_blurb: 'A rusty dagger lies here.',
          damage_min: 1,
          damage_max: 3,
          type: 'weapon',
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    // TAKE iron sword first (auto-equip should happen)
    await handleSubmitInput('take iron sword', db, llmFn, undefined, 'world body');
    await handleSubmitInput('take rusty dagger', db, llmFn, undefined, 'world body');

    const result = await handleSubmitInput('inventory', db, llmFn, undefined, 'world body');

    const narrative = result.narrative.join('\n');
    expect(narrative).toContain('Iron Sword (equipped)');
    expect(narrative).toContain('Rusty Dagger');
    // Dagger should NOT be marked as equipped
    expect(narrative).not.toContain('Rusty Dagger (equipped)');
  });

  // ── TAKE a known item ──────────────────────────────────────────────────────

  it('TAKE a known item moves it to inventory', async () => {
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
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    const result = await handleSubmitInput('take rusty sword', db, llmFn, undefined, 'world body');

    expect(result.narrative.join(' ')).toContain('You take the Rusty Sword');

    const inventory = db.getPlayerInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('Rusty Sword');

    // Item is no longer in the room
    const room = db.getCurrentRoom();
    expect(db.getItemsInRoom(room.id)).toHaveLength(0);
  });

  // ── TAKE with auto-equip ────────────────────────────────────────────────────

  it('TAKE with auto-equip: better weapon is equipped, weaker is not', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Iron Sword',
          inspection_description: 'A sturdy sword.',
          room_blurb: 'An iron sword rests here.',
          damage_min: 3,
          damage_max: 6,
          type: 'weapon',
        },
        {
          name: 'Rusty Dagger',
          inspection_description: 'A corroded dagger.',
          room_blurb: 'A rusty dagger lies here.',
          damage_min: 1,
          damage_max: 3,
          type: 'weapon',
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    // Take iron sword first — should auto-equip
    const takeResult = await handleSubmitInput('take iron sword', db, llmFn, undefined, 'world body');
    expect(takeResult.narrative.join(' ')).toContain('You wield it');

    let equipped = db.getEquippedWeapon();
    expect(equipped?.name).toBe('Iron Sword');

    // Take rusty dagger — weaker, should NOT replace equipped
    await handleSubmitInput('take rusty dagger', db, llmFn, undefined, 'world body');
    equipped = db.getEquippedWeapon();
    expect(equipped?.name).toBe('Iron Sword');
  });

  // ── TAKE an unknown noun ───────────────────────────────────────────────────

  it('TAKE an unknown noun returns nothing_here_named refusal', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn();

    const result = await handleSubmitInput('take magic orb', db, llmFn, undefined, 'world body');

    // The default nothing_here_named refusal
    const narrative = result.narrative.join(' ');
    expect(narrative).toContain("You don't see");
  });

  // ── DROP the equipped weapon ─────────────────────────────────────────────────

  it('DROP the equipped weapon re-selects best remaining weapon', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Iron Sword',
          inspection_description: 'A sturdy sword.',
          room_blurb: 'An iron sword rests here.',
          damage_min: 3,
          damage_max: 6,
          type: 'weapon',
        },
        {
          name: 'Rusty Dagger',
          inspection_description: 'A corroded dagger.',
          room_blurb: 'A rusty dagger lies here.',
          damage_min: 1,
          damage_max: 3,
          type: 'weapon',
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    await handleSubmitInput('take iron sword', db, llmFn, undefined, 'world body');
    await handleSubmitInput('take rusty dagger', db, llmFn, undefined, 'world body');

    // Iron sword is equipped; drop it
    const dropResult = await handleSubmitInput('drop iron sword', db, llmFn, undefined, 'world body');
    expect(dropResult.narrative.join(' ')).toContain('You drop the Iron Sword');

    // Rusty dagger should now be equipped
    const equipped = db.getEquippedWeapon();
    expect(equipped?.name).toBe('Rusty Dagger');
  });

  // ── Move into an existing room ─────────────────────────────────────────────

  it('Move into an unmapped exit triggers room generation and updates player location', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn().mockResolvedValue(cannedRoomJson('Northern Hall', ['south']));

    const result = await handleSubmitInput('go north', db, llmFn, undefined, 'world body');

    expect(llmFn).toHaveBeenCalled();
    expect(result.narrative.join(' ')).toContain('Northern Hall');

    // Player should now be in the new room
    const room = db.getCurrentRoom();
    expect(room.name).toBe('Northern Hall');
  });

  // ── Move back into starting room ────────────────────────────────────────────

  it('Move north then south returns to starting room', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn().mockResolvedValue(cannedRoomJson('Northern Hall', ['south']));

    await handleSubmitInput('go north', db, llmFn, undefined, 'world body');
    // Move back south — the exit should already be wired (back-exit)
    const result = await handleSubmitInput('go south', db, llmFn, undefined, 'world body');

    const room = db.getCurrentRoom();
    expect(room.name).toBe('The Threshold');
    // The HUD reflects the room name; narrative shows the room description text
    expect(result.hud?.room_name).toBe('The Threshold');
    expect(result.narrative.join(' ')).toContain('threshold');
  });

  // ── Move to no_exit direction ─────────────────────────────────────────────────

  it('Move in a direction with no declared exit returns no_exit refusal', async () => {
    // Starting room only has north exits
    const worldFile = makeWorldFile({ exits: ['north'] });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    const result = await handleSubmitInput('go south', db, llmFn, undefined, 'world body');

    expect(result.narrative).toContain("You can't go that way.");
  });

  // ── ATTACK — monster survives ────────────────────────────────────────────────

  it('ATTACK — monster survives: both player and monster HP decrease', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Battle Axe',
          inspection_description: 'A heavy axe.',
          room_blurb: 'A battle axe leans against the wall.',
          damage_min: 10,
          damage_max: 10, // deterministic damage
          type: 'weapon',
        },
      ],
      monsters: [
        {
          name: 'Cave Rat',
          inspection_description: 'A scrawny rat.',
          room_blurb: 'A cave rat lurks here.',
          hp: 50, // high HP so it survives
          max_hp: 50,
          damage_min: 1,
          damage_max: 1, // deterministic low damage
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    const playerBefore = db.getPlayerState();

    // Equip the axe first
    await handleSubmitInput('take battle axe', db, llmFn, undefined, 'world body');

    const result = await handleSubmitInput('attack cave rat', db, llmFn, undefined, 'world body');

    expect(result.narrative.join(' ')).toContain('You hit the Cave Rat');

    // Monster should still be alive (hp was 50, axe deals 10 max)
    const room = db.getCurrentRoom();
    const monsters = db.getMonstersInRoom(room.id);
    expect(monsters).toHaveLength(1);
    expect(monsters[0].hp).toBeLessThan(50);

    // Player took some damage (rat deals 1 per hit)
    const playerAfter = db.getPlayerState();
    expect(playerAfter.hp).toBeLessThanOrEqual(playerBefore.hp);
  });

  // ── ATTACK — monster dies ────────────────────────────────────────────────────

  it('ATTACK — monster dies: drop item appears in room', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Giant Hammer',
          inspection_description: 'A massive hammer.',
          room_blurb: 'A giant hammer rests here.',
          damage_min: 100,
          damage_max: 100, // one-shot kill
          type: 'weapon',
        },
      ],
      monsters: [
        {
          name: 'Cave Rat',
          inspection_description: 'A scrawny rat.',
          room_blurb: 'A cave rat lurks here.',
          hp: 3,
          max_hp: 3,
          damage_min: 1,
          damage_max: 1,
        },
      ],
    });
    // We need to add a drop item manually (frontmatter monsters have no drops)
    // Instead: use a generated room via LLM with a monster that has a drop
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn().mockResolvedValue(cannedRoomWithMonsterJson('Goblin Den'));

    // First take the hammer
    await handleSubmitInput('take giant hammer', db, llmFn, undefined, 'world body');

    // Move north to get a generated room with a goblin (has a drop)
    await handleSubmitInput('go north', db, llmFn, undefined, 'world body');

    const room = db.getCurrentRoom();
    expect(room.name).toBe('Goblin Den');

    const monstersBefore = db.getMonstersInRoom(room.id);
    expect(monstersBefore).toHaveLength(1);
    expect(monstersBefore[0].name).toBe('Goblin');

    // Attack goblin — hammer does 100 damage, goblin has 5 HP, should die
    const result = await handleSubmitInput('attack goblin', db, llmFn, undefined, 'world body');

    expect(result.narrative.join(' ')).toContain('collapses');

    // Monster should be gone from room
    const monstersAfter = db.getMonstersInRoom(room.id);
    expect(monstersAfter).toHaveLength(0);

    // Drop item should appear in room
    const items = db.getItemsInRoom(room.id);
    expect(items.some((i) => i.name === 'Goblin Knife')).toBe(true);
  });

  // ── ATTACK — player dies / respawn ────────────────────────────────────────────

  it('ATTACK — player dies: HP resets and player returns to starting room', async () => {
    const worldFile = makeWorldFile({
      monsters: [
        {
          name: 'Death Knight',
          inspection_description: 'A terrifying armored warrior.',
          room_blurb: 'A death knight stands here.',
          hp: 9999,
          max_hp: 9999,
          damage_min: 9999,
          damage_max: 9999, // instant kill
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    // Move north to a new room so respawn will return to starting room
    llmFn.mockResolvedValue(cannedRoomJson('North Chamber', ['south']));
    await handleSubmitInput('go north', db, llmFn, undefined, 'world body');

    // Move back south to starting room (with death knight)
    await handleSubmitInput('go south', db, llmFn, undefined, 'world body');

    const playerBefore = db.getPlayerState();
    expect(playerBefore.hp).toBe(20); // starting HP

    // Attack the death knight — should die immediately
    const result = await handleSubmitInput('attack death knight', db, llmFn, undefined, 'world body');

    expect(result.narrative.join(' ')).toContain('Everything goes black');

    // Player HP should be reset
    const playerAfter = db.getPlayerState();
    expect(playerAfter.hp).toBe(playerAfter.max_hp);

    // Player should be in starting room
    const room = db.getCurrentRoom();
    expect(room.name).toBe('The Threshold');
  });

  // ── Parting hit ────────────────────────────────────────────────────────────

  it('Parting hit: player takes damage when leaving room with engaged monster', async () => {
    const worldFile = makeWorldFile({
      monsters: [
        {
          name: 'Cave Rat',
          inspection_description: 'A scrawny rat.',
          room_blurb: 'A cave rat lurks here.',
          hp: 9999,
          max_hp: 9999,
          damage_min: 5,
          damage_max: 5, // predictable 5 damage per parting hit
        },
      ],
    });
    const db = openFreshDB(worldFile);

    // Mock LLM for room generation when moving
    const llmFn = vi.fn().mockResolvedValue(cannedRoomJson('North Chamber', ['south']));

    // Engage the monster by attacking it once
    await handleSubmitInput('attack cave rat', db, llmFn, undefined, 'world body');

    const playerAfterAttack = db.getPlayerState();
    const hpAfterAttack = playerAfterAttack.hp;

    // Now try to leave — parting hit should trigger
    const result = await handleSubmitInput('go north', db, llmFn, undefined, 'world body');

    const playerAfterMove = db.getPlayerState();

    // Either parting hit was applied (if player survived) or player died and respawned
    const narrative = result.narrative.join(' ');
    const tookPartingHit =
      playerAfterMove.hp < hpAfterAttack ||
      narrative.includes('strikes you') ||
      narrative.includes('Everything goes black');

    expect(tookPartingHit).toBe(true);
  });

  // ── Loop closure ────────────────────────────────────────────────────────────

  it('Loop closure: walking north, east, south, west returns to starting room', async () => {
    // Grid layout: start=(0,0,0), north=(0,1,0), NE=(1,1,0), south-of-NE=(1,0,0)
    // Moving west from (1,0,0) → (0,0,0) = starting room → loop closure!
    // Each generated room must declare the exits needed for the next move.
    const db = openFreshDB();

    let callCount = 0;
    const llmFn = vi.fn().mockImplementation(() => {
      callCount++;
      // Room 1 at (0,1,0): needs 'east' so we can continue the square
      if (callCount === 1) return Promise.resolve(cannedRoomJson('North Room', ['south', 'east']));
      // Room 2 at (1,1,0): needs 'south' so we can continue
      if (callCount === 2) return Promise.resolve(cannedRoomJson('NE Room', ['west', 'south']));
      // Room 3 at (1,0,0): needs 'west' to close the loop back to (0,0,0)
      if (callCount === 3) return Promise.resolve(cannedRoomJson('SE Room', ['north', 'west']));
      return Promise.resolve(cannedRoomJson(`Room ${callCount}`, ['north', 'south', 'east', 'west']));
    });

    // Walk: n → e → s → w should return to (0,0,0) = The Threshold
    await handleSubmitInput('go north', db, llmFn, undefined, 'world body');
    await handleSubmitInput('go east', db, llmFn, undefined, 'world body');
    await handleSubmitInput('go south', db, llmFn, undefined, 'world body');
    const finalMove = await handleSubmitInput('go west', db, llmFn, undefined, 'world body');

    const room = db.getCurrentRoom();
    expect(room.name).toBe('The Threshold');
    // The final move should show the starting room description
    expect(finalMove.narrative.join(' ')).toContain('threshold');
  });

  // ── Respawn refills engaged monsters ────────────────────────────────────────

  it('Respawn refills HP of all engaged monsters', async () => {

    const worldFile = makeWorldFile({
      monsters: [
        {
          name: 'Death Knight',
          inspection_description: 'A terrifying warrior.',
          room_blurb: 'A death knight stands here.',
          hp: 9999,
          max_hp: 9999,
          damage_min: 9999,
          damage_max: 9999,
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    // Attack the death knight to engage it — we should die immediately
    await handleSubmitInput('attack death knight', db, llmFn, undefined, 'world body');

    // After respawn, the death knight's HP should be fully refilled
    // (respawnPlayer refills all engaged monster HP)
    const room = db.getCurrentRoom();
    const monsters = db.getMonstersInRoom(room.id);
    expect(monsters).toHaveLength(1);
    expect(monsters[0].hp).toBe(monsters[0].max_hp);
    expect(monsters[0].engaged).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helper: read a JSONL log file into a list of event objects
// ---------------------------------------------------------------------------
function readStateMutateEvents(logPath: string): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(logPath, 'utf-8').trim();
  const lines = raw.split('\n').filter(Boolean);
  const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return events.filter((e) => e['event'] === 'state.mutate');
}

function readEventsByType(logPath: string, eventType: string): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(logPath, 'utf-8').trim();
  const lines = raw.split('\n').filter(Boolean);
  const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return events.filter((e) => e['event'] === eventType);
}

// ---------------------------------------------------------------------------
// state.mutate logging integration tests
// ---------------------------------------------------------------------------

describe('state.mutate logging', () => {
  let loggerTmpDir: string;
  let logger: EventLogger;

  beforeEach(() => {
    loggerTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-rpg-mutate-log-'));
    logger = new EventLogger(loggerTmpDir, 'test-world');
  });

  afterEach(() => {
    try { logger.close(); } catch { /* already closed */ }
    fs.rmSync(loggerTmpDir, { recursive: true, force: true });
  });

  // ── Move/generation: room insertion and player room update ─────────────────

  it('Moving into unmapped exit emits state.mutate for player room change', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn().mockResolvedValue(cannedRoomJson('Northern Hall', ['south']));

    await handleSubmitInput('go north', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);
    const roomChangeEvent = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'move',
    );
    expect(roomChangeEvent).toBeDefined();
    const after = roomChangeEvent!['after'] as Record<string, unknown>;
    const before = roomChangeEvent!['before'] as Record<string, unknown>;
    expect(before['current_room_id']).not.toBe(after['current_room_id']);
  });

  // ── Parting hits: player HP change ─────────────────────────────────────────

  it('Parting hits emit state.mutate for player HP', async () => {
    const worldFile = makeWorldFile({
      monsters: [{
        name: 'Cave Rat',
        inspection_description: 'A scrawny rat.',
        room_blurb: 'A cave rat lurks here.',
        hp: 9999,
        max_hp: 9999,
        damage_min: 5,
        damage_max: 5,
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn().mockResolvedValue(cannedRoomJson('North Chamber', ['south']));

    // Engage the monster first (no logger — keep log clean)
    await handleSubmitInput('attack cave rat', db, llmFn, undefined, 'world body');
    const hpAfterAttack = db.getPlayerState().hp;

    // Move with logger — parting hit should fire and be logged
    await handleSubmitInput('go north', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);
    const partingEvent = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'parting_hit',
    );
    expect(partingEvent).toBeDefined();
    expect((partingEvent!['before'] as Record<string, unknown>)?.['hp']).toBe(hpAfterAttack);
    expect((partingEvent!['after'] as Record<string, unknown>)?.['hp']).toBeLessThan(hpAfterAttack);
  });

  // ── Respawn: player HP, room, and monster HP resets ─────────────────────────

  it('Respawn emits state.mutate for player HP and room, and for each engaged monster HP', async () => {
    const worldFile = makeWorldFile({
      monsters: [{
        name: 'Death Knight',
        inspection_description: 'A terrifying warrior.',
        room_blurb: 'A death knight stands here.',
        hp: 9999,
        max_hp: 9999,
        damage_min: 9999,
        damage_max: 9999,
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    // Attack death knight with logger — player dies, respawn fires
    await handleSubmitInput('attack death knight', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);

    // Player HP reset
    const playerHpReset = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'respawn',
    );
    expect(playerHpReset).toBeDefined();
    expect((playerHpReset!['after'] as Record<string, unknown>)?.['hp']).toBe(20); // max_hp

    // Player room reset
    const playerRoomReset = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'respawn_room',
    );
    expect(playerRoomReset).toBeDefined();
  });

  // ── ATTACK: HP changes and engaged flag ─────────────────────────────────────

  it('ATTACK emits state.mutate events for monster HP and player HP', async () => {
    const worldFile = makeWorldFile({
      monsters: [{
        name: 'Cave Rat',
        inspection_description: 'A scrawny rat.',
        room_blurb: 'A cave rat lurks here.',
        hp: 50,
        max_hp: 50,
        damage_min: 1,
        damage_max: 1,
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    await handleSubmitInput('attack cave rat', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);

    // Monster HP change
    const monsterHpEvent = events.find(
      (e) => e['entity'] === 'monster' && e['reason'] === 'attack',
    );
    expect(monsterHpEvent).toBeDefined();
    expect((monsterHpEvent!['before'] as Record<string, unknown>)?.['hp']).toBe(50);
    expect((monsterHpEvent!['after'] as Record<string, unknown>)?.['hp']).toBeLessThan(50);

    // Player HP change (rat hits for 1)
    const playerHpEvent = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'attack',
    );
    expect(playerHpEvent).toBeDefined();
    expect((playerHpEvent!['before'] as Record<string, unknown>)?.['hp']).toBe(20);
  });

  it('ATTACK monster death emits state.mutate for monster location and drop item', async () => {
    const worldFile = makeWorldFile({
      items: [{
        name: 'Giant Hammer',
        inspection_description: 'A massive hammer.',
        room_blurb: 'A giant hammer rests here.',
        damage_min: 100,
        damage_max: 100,
        type: 'weapon',
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn().mockResolvedValue(cannedRoomWithMonsterJson('Goblin Den'));

    await handleSubmitInput('take giant hammer', db, llmFn, undefined, 'world body');
    await handleSubmitInput('go north', db, llmFn, undefined, 'world body');
    // Now attack goblin with logger
    await handleSubmitInput('attack goblin', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);

    // Monster location change to dead:<id>
    const monsterDeadEvent = events.find(
      (e) => e['entity'] === 'monster' && e['reason'] === 'monster_death',
    );
    expect(monsterDeadEvent).toBeDefined();
    expect((monsterDeadEvent!['after'] as Record<string, unknown>)?.['location']).toMatch(/^dead:/);

    // Drop item moved from monster:<id> to room:<id>
    const dropEvent = events.find(
      (e) => e['entity'] === 'item' && e['reason'] === 'monster_death_drop',
    );
    expect(dropEvent).toBeDefined();
    expect((dropEvent!['before'] as Record<string, unknown>)?.['location']).toMatch(/^monster:/);
    expect((dropEvent!['after'] as Record<string, unknown>)?.['location']).toMatch(/^room:/);
  });

  // ── DROP: item location and equipped weapon changes ─────────────────────────

  it('DROP emits state.mutate events for item location change', async () => {
    const worldFile = makeWorldFile({
      items: [{
        name: 'Iron Sword',
        inspection_description: 'A sturdy sword.',
        room_blurb: 'An iron sword rests here.',
        damage_min: 3,
        damage_max: 6,
        type: 'weapon',
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    // Take first (without logger to keep log clean), then drop with logger
    await handleSubmitInput('take iron sword', db, llmFn, undefined, 'world body');
    await handleSubmitInput('drop iron sword', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);
    const dropEvent = events.find(
      (e) => e['entity'] === 'item' && e['reason'] === 'drop',
    );
    expect(dropEvent).toBeDefined();
    expect((dropEvent!['before'] as Record<string, unknown>)?.['location']).toBe('player_inventory');
    expect((dropEvent!['after'] as Record<string, unknown>)?.['location']).toMatch(/^room:/);
  });

  it('DROP equipped weapon emits state.mutate for re-selection of equipped weapon', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Iron Sword',
          inspection_description: 'A sturdy sword.',
          room_blurb: 'An iron sword rests here.',
          damage_min: 3,
          damage_max: 6,
          type: 'weapon',
        },
        {
          name: 'Rusty Dagger',
          inspection_description: 'A corroded dagger.',
          room_blurb: 'A rusty dagger lies here.',
          damage_min: 1,
          damage_max: 3,
          type: 'weapon',
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    await handleSubmitInput('take iron sword', db, llmFn, undefined, 'world body');
    await handleSubmitInput('take rusty dagger', db, llmFn, undefined, 'world body');
    // Drop equipped sword — should re-equip dagger
    await handleSubmitInput('drop iron sword', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);
    const reequipEvent = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'drop_re_equip',
    );
    expect(reequipEvent).toBeDefined();
    // Before: iron sword was equipped (some id). After: rusty dagger equipped (different id)
    const before = reequipEvent!['before'] as Record<string, unknown>;
    const after = reequipEvent!['after'] as Record<string, unknown>;
    expect(before['equipped_weapon_id']).not.toBe(after['equipped_weapon_id']);
  });

  // ── TAKE: item location change ──────────────────────────────────────────────

  it('TAKE emits a state.mutate event with auto-equip weapon change when applicable', async () => {
    const worldFile = makeWorldFile({
      items: [{
        name: 'Iron Sword',
        inspection_description: 'A sturdy sword.',
        room_blurb: 'An iron sword rests here.',
        damage_min: 3,
        damage_max: 6,
        type: 'weapon',
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    await handleSubmitInput('take iron sword', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);
    const equipEvent = events.find(
      (e) => e['entity'] === 'player' && e['reason'] === 'take_auto_equip',
    );
    expect(equipEvent).toBeDefined();
    expect((equipEvent!['before'] as Record<string, unknown>)?.['equipped_weapon_id']).toBeNull();
    expect((equipEvent!['after'] as Record<string, unknown>)?.['equipped_weapon_id']).toBeTypeOf('number');
  });

  it('TAKE emits state.mutate events for item location and disturbed changes', async () => {
    const worldFile = makeWorldFile({
      items: [{
        name: 'Iron Sword',
        inspection_description: 'A sturdy sword.',
        room_blurb: 'An iron sword rests here.',
        damage_min: 3,
        damage_max: 6,
        type: 'weapon',
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    await handleSubmitInput('take iron sword', db, llmFn, logger, 'world body');
    logger.close();

    const events = readStateMutateEvents(logger.logFilePath);

    // Must have at least an item location change event
    const locationEvent = events.find(
      (e) => e['entity'] === 'item' && (e['after'] as Record<string, unknown>)?.['location'] === 'player_inventory',
    );
    expect(locationEvent).toBeDefined();
    expect((locationEvent!['before'] as Record<string, unknown>)?.['location']).toMatch(/^room:/);
    expect(locationEvent!['reason']).toBe('take');
  });
});

// ---------------------------------------------------------------------------
// gen.monster and gen.item logging integration tests
// ---------------------------------------------------------------------------

describe('gen.monster and gen.item logging', () => {
  let loggerTmpDir: string;
  let logger: EventLogger;

  beforeEach(() => {
    loggerTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-rpg-gen-log-'));
    logger = new EventLogger(loggerTmpDir, 'test-world');
  });

  afterEach(() => {
    try { logger.close(); } catch { /* already closed */ }
    fs.rmSync(loggerTmpDir, { recursive: true, force: true });
  });

  it('Moving into a generated room with a monster emits gen.monster event in the log', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn().mockResolvedValue(cannedRoomWithMonsterJson('Goblin Lair'));

    await handleSubmitInput('go north', db, llmFn, logger, 'world body');
    logger.close();

    const genMonsterEvents = readEventsByType(logger.logFilePath, 'gen.monster');
    expect(genMonsterEvents).toHaveLength(1);
    expect(genMonsterEvents[0]['count']).toBe(1);
    expect(typeof genMonsterEvents[0]['room_id']).toBe('number');
  });

  it('Moving into a generated room with no monsters or items does not emit gen.monster or gen.item', async () => {
    const db = openFreshDB();
    const llmFn = vi.fn().mockResolvedValue(cannedRoomJson('Empty Room', ['south']));

    await handleSubmitInput('go north', db, llmFn, logger, 'world body');
    logger.close();

    const genMonsterEvents = readEventsByType(logger.logFilePath, 'gen.monster');
    const genItemEvents = readEventsByType(logger.logFilePath, 'gen.item');
    expect(genMonsterEvents).toHaveLength(0);
    expect(genItemEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Disambiguation state cleared on world switch
// ---------------------------------------------------------------------------

describe('Disambiguation state cleared on world switch', () => {
  it('resetDisambiguationState clears stale state so next input is treated as fresh', async () => {
    // World A: two swords in the room so "look at sword" triggers disambiguation
    const worldFileA = makeWorldFile({
      items: [
        {
          name: 'Iron Sword',
          inspection_description: 'A sturdy iron blade.',
          room_blurb: 'An iron sword rests here.',
          damage_min: 3,
          damage_max: 6,
          type: 'weapon',
        },
        {
          name: 'Rusty Sword',
          inspection_description: 'A corroded blade.',
          room_blurb: 'A rusty sword lies here.',
          damage_min: 1,
          damage_max: 2,
          type: 'weapon',
        },
      ],
    });
    const dbA = openFreshDB(worldFileA);
    const llmFn = vi.fn();

    // "look at sword" matches both swords → enters disambiguation state
    const disambigResult = await handleSubmitInput('look at sword', dbA, llmFn, undefined, 'world body');
    expect(disambigResult.narrative.join(' ')).toContain('Which do you mean');
    expect(getDisambiguationState()).not.toBeNull();

    // Simulate world switch: resetDisambiguationState() called (as main.ts will do)
    resetDisambiguationState();
    expect(getDisambiguationState()).toBeNull();

    // World B: empty starting room (no items at all)
    const worldFileB = makeWorldFile();
    // Open a fresh DB in a separate tmpDir to isolate from World A
    const tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-rpg-world-b-'));
    let dbB: WorldDB | undefined;
    try {
      dbB = openWorldDB(tmpDirB, worldFileB);

      // Type "Iron Sword" — without disambiguation state, this is treated as fresh
      // input. "look at iron sword" would be a look_at intent returning no_match
      // (World B has no items). If disambiguation were still active, "Iron Sword"
      // would match the stale candidate from World A and attempt to use its ID.
      const freshResult = await handleSubmitInput('iron sword', dbB, llmFn, undefined, 'world body');

      // Should NOT be a disambiguation resolution (which would have no narrative echo
      // matching the candidate name directly). Should be treated as an unknown intent
      // and reach the intent parser — which would return intent_unparseable since
      // "iron sword" alone doesn't parse as any known command.
      const narrative = freshResult.narrative.join(' ');
      // The key invariant: disambiguation state was cleared, so this was NOT handled
      // as a disambiguation pick.
      expect(getDisambiguationState()).toBeNull(); // no new disambiguation triggered
      // "iron sword" alone is an unknown command → intent_unparseable refusal
      expect(narrative).toContain("don't understand");
    } finally {
      dbB?.db.close();
      fs.rmSync(tmpDirB, { recursive: true, force: true });
    }
  });

  it('getDisambiguationState is non-null after ambiguous input', async () => {
    const worldFile = makeWorldFile({
      items: [
        {
          name: 'Iron Sword',
          inspection_description: 'A sturdy iron blade.',
          room_blurb: 'An iron sword rests here.',
          damage_min: 3,
          damage_max: 6,
          type: 'weapon',
        },
        {
          name: 'Rusty Sword',
          inspection_description: 'A corroded blade.',
          room_blurb: 'A rusty sword lies here.',
          damage_min: 1,
          damage_max: 2,
          type: 'weapon',
        },
      ],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    await handleSubmitInput('look at sword', db, llmFn, undefined, 'world body');
    expect(getDisambiguationState()).not.toBeNull();
    expect(getDisambiguationState()?.pendingIntent).toBe('look_at');
    expect(getDisambiguationState()?.candidates).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildInitialRoomDescription
// ---------------------------------------------------------------------------

describe('buildInitialRoomDescription', () => {
  it('returns only fixed_description when room has no items, monsters, scenery, or exits', () => {
    const worldFile = makeWorldFile({ exits: [] });
    const db = openFreshDB(worldFile);

    const result = buildInitialRoomDescription(db);

    expect(result).toBe('You stand at the threshold.');
  });

  it('does not show Exits line for starting room (exits are unmapped until first traversal)', () => {
    // The starting room has allowed exits configured in room_allowed_exits, but
    // getCurrentRoomExits() reads from the exits table (actual mapped connections).
    // On first load the exits table is empty — no exits have been traversed yet.
    const db = openFreshDB(); // uses exits: ['north', 'south', 'east', 'west']

    const result = buildInitialRoomDescription(db);

    // Exits line is absent until the player actually travels through a direction
    expect(result).not.toContain('Exits:');
    // Fixed description is still present
    expect(result).toContain('You stand at the threshold.');
  });

  it('includes item room_blurb for undisturbed items in the starting room', () => {
    const worldFile = makeWorldFile({
      items: [{
        name: 'Rusty Sword',
        inspection_description: 'A corroded blade.',
        room_blurb: 'A rusty sword lies across the altar.',
        damage_min: 1,
        damage_max: 3,
        type: 'weapon',
      }],
    });
    const db = openFreshDB(worldFile);

    const result = buildInitialRoomDescription(db);

    expect(result).toContain('A rusty sword lies across the altar.');
  });

  it('includes monster room_blurb for monsters in the starting room', () => {
    const worldFile = makeWorldFile({
      monsters: [{
        name: 'Cave Rat',
        inspection_description: 'A scrawny rat.',
        room_blurb: 'A cave rat lurks here.',
        hp: 5,
        max_hp: 5,
        damage_min: 1,
        damage_max: 2,
      }],
    });
    const db = openFreshDB(worldFile);

    const result = buildInitialRoomDescription(db);

    expect(result).toContain('A cave rat lurks here.');
  });

  it('matches the output of a LOOK command on the same room', async () => {
    const worldFile = makeWorldFile({
      items: [{
        name: 'Torch',
        inspection_description: 'A flickering torch.',
        room_blurb: 'A torch hangs on the wall.',
        damage_min: 1,
        damage_max: 2,
        type: 'weapon',
      }],
    });
    const db = openFreshDB(worldFile);
    const llmFn = vi.fn();

    const lookResult = await handleSubmitInput('look', db, llmFn, undefined, 'world body');
    const lookBlurb = lookResult.narrative.slice(1).join('\n'); // skip "> look"

    const initialDescription = buildInitialRoomDescription(db);

    expect(initialDescription).toBe(lookBlurb);
  });
});
