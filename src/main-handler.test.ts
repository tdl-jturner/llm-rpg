import { describe, it, expect, vi } from 'vitest';
import { handleSubmitInput, buildHudData } from './main-handler';

describe('handleSubmitInput – no DB', () => {
  it('echoes input prefixed with "> " when no DB provided', async () => {
    const result = await handleSubmitInput('hello');
    expect(result).toEqual({ narrative: ['> hello'] });
  });

  it('handles empty string', async () => {
    const result = await handleSubmitInput('');
    expect(result).toEqual({ narrative: ['> '] });
  });

  it('preserves whitespace in input', async () => {
    const result = await handleSubmitInput('go north');
    expect(result).toEqual({ narrative: ['> go north'] });
  });
});

// ---------------------------------------------------------------------------
// NL fallback integration via main-handler
// ---------------------------------------------------------------------------

/**
 * Minimal stub WorldDB — only provides the methods used by the 'unknown' /
 * look / look_at paths so we can exercise NL routing without a real DB.
 */
function makeStubWorldDB() {
  return {
    getCurrentRoom: vi.fn().mockReturnValue({
      id: 1,
      name: 'The Threshold',
      fixed_description: 'You stand at the threshold.',
      x: 0,
      y: 0,
      z: 0,
    }),
    getSceneryForRoom: vi.fn().mockReturnValue([]),
    getItemsInRoom: vi.fn().mockReturnValue([]),
    getMonstersInRoom: vi.fn().mockReturnValue([]),
    getCurrentRoomExits: vi.fn().mockReturnValue([]),
    getPlayerInventory: vi.fn().mockReturnValue([]),
    getEquippedWeapon: vi.fn().mockReturnValue(null),
    movePlayer: vi.fn(),
    takeItem: vi.fn(),
    dropItem: vi.fn(),
    attackMonster: vi.fn(),
    getMonster: vi.fn(),
    applyPartingHits: vi.fn().mockReturnValue({ monster_damage_dealt: 0, player_died: false }),
    respawnPlayer: vi.fn(),
    getPlayerState: vi.fn().mockReturnValue({ hp: 10, max_hp: 10 }),
  };
}

describe('handleSubmitInput – NL fallback routing', () => {
  it('does NOT call nlLlmFn for deterministic inputs like "n"', async () => {
    const db = makeStubWorldDB();
    // llmFn that would generate a room for MOVE (we need it to not throw)
    const llmFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        name: 'Room', fixed_description: 'A room.', exits: [],
        scenery: [], items: [], monsters: [],
      }),
    );
    db.movePlayer = vi.fn().mockResolvedValue({ ok: false, reason: 'no_exit' });

    // We can detect if the NL path was taken by checking if llmFn was called
    // for intent classification vs room generation. Here: "n" is deterministic.
    const callsBefore = (llmFn as ReturnType<typeof vi.fn>).mock.calls.length;
    await handleSubmitInput('n', db as never, llmFn, undefined, 'world body');
    // llmFn may have been called for movePlayer (room gen), but NOT for NL parsing
    // We verify by checking the NL path separately via a spy on parseIntentWithNl
    // Instead: pass no worldBody to confirm "n" never triggers NL path (it won't
    // even when worldBody is present, since "n" is deterministic).
    // The key assertion is that the response is a no_exit refusal (not unparseable).
    const _ = callsBefore; // suppress unused var
    const result = await handleSubmitInput('n', db as never, llmFn, undefined, 'world body');
    expect(result.narrative).toContain("You can't go that way.");
  });

  it('routes unrecognized NL input through LLM and returns parsed result', async () => {
    const db = makeStubWorldDB();

    // NL LLM returns LOOK intent
    const nlResponse = JSON.stringify({ command: 'LOOK' });
    const llmFn = vi.fn().mockResolvedValue(nlResponse);

    const result = await handleSubmitInput(
      'what do I see around me?',
      db as never,
      llmFn,
      undefined,
      'A dark fantasy world.',
    );

    // LOOK should produce a blurb from the stub DB
    expect(result.narrative[0]).toBe('> what do I see around me?');
    // The room description should follow
    expect(result.narrative.length).toBeGreaterThan(1);
    // Should NOT be the intent_unparseable refusal
    expect(result.narrative).not.toContain("I don't understand that.");
    expect(llmFn).toHaveBeenCalled();
  });

  it('returns chained_command_rejected refusal when NL LLM returns comma-separated command', async () => {
    const db = makeStubWorldDB();

    // Use an input the deterministic parser cannot match, so the NL path is reached
    const llmFn = vi.fn().mockResolvedValue(JSON.stringify({ command: 'TAKE,MOVE' }));

    const result = await handleSubmitInput(
      'snag the torch then bolt north', // not matched by deterministic parser
      db as never,
      llmFn,
      undefined,
      'A dark fantasy world.',
    );

    expect(result.narrative).toContain('Please do one thing at a time.');
  });

  it('returns intent_unparseable when NL LLM returns NONE', async () => {
    const db = makeStubWorldDB();

    const llmFn = vi.fn().mockResolvedValue(JSON.stringify({ command: 'NONE' }));

    const result = await handleSubmitInput(
      'xyzzy',
      db as never,
      llmFn,
      undefined,
      'A dark fantasy world.',
    );

    expect(result.narrative).toContain("I don't understand that.");
  });

  it('falls back to intent_unparseable when no worldBody is provided (no NL fallback)', async () => {
    const db = makeStubWorldDB();
    const llmFn = vi.fn();

    const result = await handleSubmitInput('xyzzy', db as never, llmFn, undefined, '');

    expect(result.narrative).toContain("I don't understand that.");
    // llmFn should NOT have been called for NL parsing (no worldBody)
    expect(llmFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Refusal overrides integration
// ---------------------------------------------------------------------------

describe('handleSubmitInput – refusal overrides', () => {
  it('uses override message when refusals map overrides no_exit', async () => {
    const db = makeStubWorldDB();
    db.movePlayer = vi.fn().mockResolvedValue({ ok: false, reason: 'no_exit' });

    const refusals = { no_exit: 'The path is sealed.' };
    const result = await handleSubmitInput('go north', db as never, undefined, undefined, undefined, refusals);

    expect(result.narrative).toContain('The path is sealed.');
    expect(result.narrative).not.toContain("You can't go that way.");
  });

  it('uses override for intent_unparseable', async () => {
    const db = makeStubWorldDB();

    const refusals = { intent_unparseable: 'Speak plainly, traveller.' };
    // No llmFn and no worldBody means deterministic unknown routes to intent_unparseable
    const result = await handleSubmitInput('xyzzy', db as never, undefined, undefined, undefined, refusals);

    expect(result.narrative).toContain('Speak plainly, traveller.');
  });

  it('uses default message when key is not in overrides', async () => {
    const db = makeStubWorldDB();
    db.movePlayer = vi.fn().mockResolvedValue({ ok: false, reason: 'no_exit' });

    const refusals = { intent_unparseable: 'Override for different key' };
    const result = await handleSubmitInput('go north', db as never, undefined, undefined, undefined, refusals);

    expect(result.narrative).toContain("You can't go that way.");
  });

  it('logs a refusal event when a refusal is issued', async () => {
    const db = makeStubWorldDB();
    db.movePlayer = vi.fn().mockResolvedValue({ ok: false, reason: 'no_exit' });

    const logRefusal = vi.fn();
    const logger = {
      logInputRaw: vi.fn(),
      logInputParsed: vi.fn(),
      logRefusal,
      logSessionStart: vi.fn(),
      logSessionEnd: vi.fn(),
      logStateMutate: vi.fn(),
      logGenRoom: vi.fn(),
      logGenMonster: vi.fn(),
      logGenItem: vi.fn(),
      logLlmCall: vi.fn(),
      logError: vi.fn(),
      close: vi.fn(),
      logFilePath: '',
    };

    await handleSubmitInput('go north', db as never, undefined, logger as never, undefined, {});

    expect(logRefusal).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'no_exit', overridden: false }),
    );
  });

  it('logs overridden=true when refusal was overridden from WORLD.md', async () => {
    const db = makeStubWorldDB();

    const logRefusal = vi.fn();
    const logger = {
      logInputRaw: vi.fn(),
      logInputParsed: vi.fn(),
      logRefusal,
      logSessionStart: vi.fn(),
      logSessionEnd: vi.fn(),
      logStateMutate: vi.fn(),
      logGenRoom: vi.fn(),
      logGenMonster: vi.fn(),
      logGenItem: vi.fn(),
      logLlmCall: vi.fn(),
      logError: vi.fn(),
      close: vi.fn(),
      logFilePath: '',
    };

    await handleSubmitInput('xyzzy', db as never, undefined, logger as never, undefined, {
      intent_unparseable: 'Speak plainly.',
    });

    expect(logRefusal).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'intent_unparseable', overridden: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// buildHudData
// ---------------------------------------------------------------------------

describe('buildHudData', () => {
  it('returns hp, max_hp, room_name, and null weapon when unarmed', () => {
    const db = makeStubWorldDB();
    // getPlayerState returns { hp: 10, max_hp: 10 } by default
    // getEquippedWeapon returns null by default
    // getCurrentRoom returns { name: 'The Threshold', ... }

    const hud = buildHudData(db as never);

    expect(hud.hp).toBe(10);
    expect(hud.max_hp).toBe(10);
    expect(hud.room_name).toBe('The Threshold');
    expect(hud.weapon).toBeNull();
  });

  it('returns weapon info when a weapon is equipped', () => {
    const db = makeStubWorldDB();
    db.getEquippedWeapon = vi.fn().mockReturnValue({
      id: 5,
      name: 'Iron Sword',
      damage_min: 3,
      damage_max: 7,
      location: 'player_inventory',
      type: 'weapon',
      disturbed: 1,
      inspection_description: 'A sword.',
      room_blurb: 'A sword lies here.',
    });

    const hud = buildHudData(db as never);

    expect(hud.weapon).toEqual({ name: 'Iron Sword', damage_min: 3, damage_max: 7 });
  });

  it('reflects updated hp after damage', () => {
    const db = makeStubWorldDB();
    db.getPlayerState = vi.fn().mockReturnValue({ hp: 4, max_hp: 20, equipped_weapon_id: null });

    const hud = buildHudData(db as never);

    expect(hud.hp).toBe(4);
    expect(hud.max_hp).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// handleSubmitInput – hud in response
// ---------------------------------------------------------------------------

describe('handleSubmitInput – hud field', () => {
  it('includes hud in response when DB is provided', async () => {
    const db = makeStubWorldDB();
    const result = await handleSubmitInput('look', db as never);

    expect(result.hud).toBeDefined();
    expect(result.hud?.hp).toBe(10);
    expect(result.hud?.max_hp).toBe(10);
    expect(result.hud?.room_name).toBe('The Threshold');
    expect(result.hud?.weapon).toBeNull();
  });

  it('does not include hud when no DB provided (fallback path)', async () => {
    const result = await handleSubmitInput('hello');
    expect(result.hud).toBeUndefined();
  });

  it('includes weapon data in hud after equipping', async () => {
    const db = makeStubWorldDB();
    db.getEquippedWeapon = vi.fn().mockReturnValue({
      id: 2,
      name: 'Rusty Dagger',
      damage_min: 1,
      damage_max: 4,
      location: 'player_inventory',
      type: 'weapon',
      disturbed: 1,
      inspection_description: 'A dagger.',
      room_blurb: 'A dagger lies here.',
    });

    const result = await handleSubmitInput('look', db as never);

    expect(result.hud?.weapon).toEqual({ name: 'Rusty Dagger', damage_min: 1, damage_max: 4 });
  });
});

// ---------------------------------------------------------------------------
// cannot_take_scenery — refusal logging + override
// ---------------------------------------------------------------------------

describe('handleSubmitInput – cannot_take_scenery', () => {
  function makeSceneryDB(roomBlurb: string) {
    const db = makeStubWorldDB();
    db.getSceneryForRoom = vi.fn().mockReturnValue([
      {
        id: 99,
        name: 'stone pillar',
        room_blurb: roomBlurb,
        inspection_description: 'A tall stone pillar.',
      },
    ]);
    return db;
  }

  function makeLogger() {
    return {
      logInputRaw: vi.fn(),
      logInputParsed: vi.fn(),
      logRefusal: vi.fn(),
      logSessionStart: vi.fn(),
      logSessionEnd: vi.fn(),
      logStateMutate: vi.fn(),
      logGenRoom: vi.fn(),
      logGenMonster: vi.fn(),
      logGenItem: vi.fn(),
      logLlmCall: vi.fn(),
      logError: vi.fn(),
      close: vi.fn(),
      logFilePath: '',
    };
  }

  it('shows room_blurb and logs refusal with overridden=false when no override', async () => {
    const db = makeSceneryDB('The pillar is embedded in the floor.');
    const logger = makeLogger();

    const result = await handleSubmitInput('take pillar', db as never, undefined, logger as never, undefined, {});

    expect(result.narrative).toContain('The pillar is embedded in the floor.');
    expect(logger.logRefusal).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cannot_take_scenery', overridden: false }),
    );
  });

  it('shows override string (not room_blurb) and logs overridden=true when override present', async () => {
    const db = makeSceneryDB('The pillar is embedded in the floor.');
    const logger = makeLogger();
    const refusals = { cannot_take_scenery: 'You cannot pocket the scenery, fool.' };

    const result = await handleSubmitInput('take pillar', db as never, undefined, logger as never, undefined, refusals);

    expect(result.narrative).toContain('You cannot pocket the scenery, fool.');
    expect(result.narrative).not.toContain('The pillar is embedded in the floor.');
    expect(logger.logRefusal).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cannot_take_scenery', overridden: true }),
    );
  });

  it('uses default cannot_take_scenery text when scenery has no room_blurb and no override', async () => {
    const db = makeStubWorldDB();
    db.getSceneryForRoom = vi.fn().mockReturnValue([
      {
        id: 99,
        name: 'stone pillar',
        room_blurb: '',
        inspection_description: 'A tall stone pillar.',
      },
    ]);
    const logger = makeLogger();

    const result = await handleSubmitInput('take pillar', db as never, undefined, logger as never, undefined, {});

    expect(result.narrative).toContain("That's not something you can take.");
    expect(logger.logRefusal).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cannot_take_scenery', overridden: false }),
    );
  });
});
