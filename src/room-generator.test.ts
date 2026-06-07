import { describe, it, expect, vi } from 'vitest';
import { createStubLLM, generateRoom, createRealLLM, buildGenerationPrompt, LIMINAL_GAP_ROOM } from './room-generator';

// ---------------------------------------------------------------------------
// Tests for the deterministic stub LLM and generateRoom
// ---------------------------------------------------------------------------

describe('createStubLLM', () => {
  it('returns a function that resolves after ~0ms in test mode', async () => {
    const stub = createStubLLM({ delayMs: 0 });
    const result = await stub('Generate a room at (1, 0, 0) with allowable exits: south');
    expect(typeof result).toBe('string');
  });

  it('returns valid JSON', async () => {
    const stub = createStubLLM({ delayMs: 0 });
    const raw = await stub('ignored prompt');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('returned JSON has the expected room fields', async () => {
    const stub = createStubLLM({ delayMs: 0 });
    const raw = await stub('Generate a room.');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof parsed['name']).toBe('string');
    expect(typeof parsed['fixed_description']).toBe('string');
    expect(Array.isArray(parsed['exits'])).toBe(true);
  });
});

describe('generateRoom', () => {
  it('returns a room with coords embedded in the name for the stub', async () => {
    const result = await generateRoom({
      coords: { x: 2, y: 0, z: 1 },
      allowableExits: ['north', 'south'],
      llmFn: createStubLLM({ delayMs: 0 }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.name).toContain('2,0,1');
      expect(result.room.fixed_description).toBeTruthy();
      expect(Array.isArray(result.room.exits)).toBe(true);
    }
  });

  it('exits returned by stub are a subset of the allowable exits', async () => {
    const allowable = ['north', 'east', 'south'];
    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: allowable,
      llmFn: createStubLLM({ delayMs: 0 }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const exit of result.room.exits) {
        expect(allowable).toContain(exit);
      }
    }
  });

  it('returns failure when LLM always returns garbage', async () => {
    const badLlm = async (_prompt: string): Promise<string> => '!!! not json !!!';
    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn: badLlm,
    });

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests for createRealLLM
// ---------------------------------------------------------------------------

describe('createRealLLM', () => {
  it('passes the prompt and model tag to the callModel function', async () => {
    const callModel = vi.fn().mockResolvedValue('{"name":"Test Room","fixed_description":"A dark hall.","exits":["north"]}');
    const llmFn = createRealLLM('heavy:7b', callModel);

    const raw = await llmFn('some prompt');
    expect(callModel).toHaveBeenCalledWith('heavy:7b', 'some prompt', true);
    expect(raw).toContain('Test Room');
  });

  it('propagates errors from callModel', async () => {
    const callModel = vi.fn().mockRejectedValue(new Error('network error'));
    const llmFn = createRealLLM('heavy:7b', callModel);

    await expect(llmFn('some prompt')).rejects.toThrow('network error');
  });

  it('logs llm.call event when logger is provided', async () => {
    const callModel = vi.fn().mockResolvedValue('{"name":"Room","fixed_description":"Desc.","exits":[]}');
    const logLlmCall = vi.fn();
    const llmFn = createRealLLM('heavy:7b', callModel, { logLlmCall });

    await llmFn('test prompt');

    expect(logLlmCall).toHaveBeenCalledOnce();
    const logArg = logLlmCall.mock.calls[0][0] as { model: string; prompt: string; response: string; ok: boolean };
    expect(logArg.model).toBe('heavy:7b');
    expect(logArg.prompt).toBe('test prompt');
    expect(logArg.ok).toBe(true);
  });

  it('logs ok:false when callModel throws', async () => {
    const callModel = vi.fn().mockRejectedValue(new Error('boom'));
    const logLlmCall = vi.fn();
    const llmFn = createRealLLM('heavy:7b', callModel, { logLlmCall });

    await expect(llmFn('test prompt')).rejects.toThrow('boom');
    expect(logLlmCall).toHaveBeenCalledOnce();
    const logArg = logLlmCall.mock.calls[0][0] as { ok: boolean };
    expect(logArg.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests for buildGenerationPrompt
// ---------------------------------------------------------------------------

describe('buildGenerationPrompt', () => {
  it('includes the world body in the prompt', () => {
    const prompt = buildGenerationPrompt(
      { x: 1, y: 0, z: 0 },
      ['north', 'south'],
      {
        worldBody: 'A dark fantasy setting.',
        previousRoomDescription: 'A damp cave.',
        directionTraveled: 'north',
        neighborState: {},
      },
    );
    expect(prompt).toContain('A dark fantasy setting.');
  });

  it('includes the previous room description', () => {
    const prompt = buildGenerationPrompt(
      { x: 1, y: 0, z: 0 },
      ['north', 'south'],
      {
        worldBody: 'World.',
        previousRoomDescription: 'A mossy stone corridor.',
        directionTraveled: 'north',
        neighborState: {},
      },
    );
    expect(prompt).toContain('A mossy stone corridor.');
  });

  it('includes direction traveled', () => {
    const prompt = buildGenerationPrompt(
      { x: 1, y: 0, z: 0 },
      ['east', 'west'],
      {
        worldBody: 'World.',
        previousRoomDescription: 'Start.',
        directionTraveled: 'east',
        neighborState: {},
      },
    );
    expect(prompt).toContain('east');
  });

  it('includes neighbor state descriptions', () => {
    const prompt = buildGenerationPrompt(
      { x: 1, y: 0, z: 0 },
      ['north'],
      {
        worldBody: 'World.',
        previousRoomDescription: 'Start.',
        directionTraveled: 'north',
        neighborState: {
          north: 'existing room named The Library',
          south: 'forced back-exit to previous room',
          east: 'empty',
        },
      },
    );
    expect(prompt).toContain('The Library');
    expect(prompt).toContain('forced back-exit');
    expect(prompt).toContain('empty');
  });

  it('includes the allowable exits', () => {
    const prompt = buildGenerationPrompt(
      { x: 0, y: 0, z: 0 },
      ['north', 'east', 'up'],
      {
        worldBody: 'World.',
        previousRoomDescription: 'Start.',
        directionTraveled: 'north',
        neighborState: {},
      },
    );
    expect(prompt).toContain('north');
    expect(prompt).toContain('east');
    expect(prompt).toContain('up');
  });
});

// ---------------------------------------------------------------------------
// Tests for LIMINAL_GAP_ROOM
// ---------------------------------------------------------------------------

describe('LIMINAL_GAP_ROOM', () => {
  it('has the expected name', () => {
    expect(LIMINAL_GAP_ROOM.name).toBe('A Liminal Gap');
  });

  it('has a non-empty fixed_description', () => {
    expect(LIMINAL_GAP_ROOM.fixed_description.length).toBeGreaterThan(0);
  });

  it('has an empty exits array (back-exit forced by caller)', () => {
    expect(LIMINAL_GAP_ROOM.exits).toEqual([]);
  });

  it('has an empty monsters array', () => {
    expect(LIMINAL_GAP_ROOM.monsters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests for monster bounds in buildGenerationPrompt
// ---------------------------------------------------------------------------

describe('buildGenerationPrompt — monster bounds', () => {
  it('includes monster hp and damage bounds in prompt when monsterBounds provided', () => {
    const prompt = buildGenerationPrompt(
      { x: 1, y: 0, z: 0 },
      ['north'],
      {
        monsterBounds: {
          hp_min: 8, hp_max: 15,
          damage_min: 2, damage_max: 4,
          drop_damage_min: 1, drop_damage_max: 2,
        },
      },
    );
    expect(prompt).toContain('8');
    expect(prompt).toContain('15');
    expect(prompt).toContain('drop');
  });

  it('uses empty monsters array instruction when no monsterBounds provided', () => {
    const prompt = buildGenerationPrompt({ x: 1, y: 0, z: 0 }, ['north'], {});
    expect(prompt).toContain('empty');
    expect(prompt).toContain('monsters');
  });
});

// ---------------------------------------------------------------------------
// Tests for monster bounds validation in generateRoom
// ---------------------------------------------------------------------------

/** Build a minimal valid GeneratedRoom JSON string */
function makeRoomJson(overrides: Partial<{
  exits: string[];
  monsters: Array<{
    name: string;
    inspection_description: string;
    room_blurb: string;
    hp: number;
    damage_min: number;
    damage_max: number;
    drop: { name: string; inspection_description: string; room_blurb: string; damage_min: number; damage_max: number };
  }>;
}> = {}): string {
  const room = {
    name: 'Test Room',
    fixed_description: 'A room.',
    exits: overrides.exits ?? ['north'],
    scenery: [],
    items: [],
    monsters: overrides.monsters ?? [],
  };
  return JSON.stringify(room);
}

const BOUNDS = {
  hp_min: 8, hp_max: 15,
  damage_min: 2, damage_max: 4,
  drop_damage_min: 1, drop_damage_max: 2,
};

const VALID_MONSTER = {
  name: 'Goblin',
  inspection_description: 'A small green creature.',
  room_blurb: 'A goblin lurks here.',
  hp: 10,
  damage_min: 2,
  damage_max: 4,
  drop: {
    name: 'Rusty Dagger',
    inspection_description: 'A rusty blade.',
    room_blurb: 'A dagger lies here.',
    damage_min: 1,
    damage_max: 2,
  },
};

describe('generateRoom — monster bounds validation', () => {
  it('passes when monster stats are within bounds', async () => {
    const llmFn = vi.fn().mockResolvedValue(makeRoomJson({ monsters: [VALID_MONSTER] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
      context: { monsterBounds: BOUNDS },
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(1);
  });

  it('triggers retry when monster hp is below hp_min', async () => {
    const outOfBoundsMonster = { ...VALID_MONSTER, hp: 3 }; // below hp_min of 8
    const llmFn = vi.fn()
      .mockResolvedValueOnce(makeRoomJson({ monsters: [outOfBoundsMonster] }))
      .mockResolvedValueOnce(makeRoomJson({ monsters: [VALID_MONSTER] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
      context: { monsterBounds: BOUNDS },
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(2);
  });

  it('triggers retry when monster hp is above hp_max', async () => {
    const outOfBoundsMonster = { ...VALID_MONSTER, hp: 99 }; // above hp_max of 15
    const llmFn = vi.fn()
      .mockResolvedValueOnce(makeRoomJson({ monsters: [outOfBoundsMonster] }))
      .mockResolvedValueOnce(makeRoomJson({ monsters: [VALID_MONSTER] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
      context: { monsterBounds: BOUNDS },
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(2);
  });

  it('triggers retry when monster damage_min is out of bounds', async () => {
    const outOfBoundsMonster = { ...VALID_MONSTER, damage_min: 10 }; // above damage_max of 4
    const llmFn = vi.fn()
      .mockResolvedValueOnce(makeRoomJson({ monsters: [outOfBoundsMonster] }))
      .mockResolvedValueOnce(makeRoomJson({ monsters: [VALID_MONSTER] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
      context: { monsterBounds: BOUNDS },
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(2);
  });

  it('triggers retry when drop damage_max exceeds drop_damage_max', async () => {
    const outOfBoundsMonster = {
      ...VALID_MONSTER,
      drop: { ...VALID_MONSTER.drop, damage_max: 99 }, // above drop_damage_max of 2
    };
    const llmFn = vi.fn()
      .mockResolvedValueOnce(makeRoomJson({ monsters: [outOfBoundsMonster] }))
      .mockResolvedValueOnce(makeRoomJson({ monsters: [VALID_MONSTER] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
      context: { monsterBounds: BOUNDS },
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false when monster bounds always fail (exhausts retries)', async () => {
    const outOfBoundsMonster = { ...VALID_MONSTER, hp: 999 };
    const llmFn = vi.fn().mockResolvedValue(makeRoomJson({ monsters: [outOfBoundsMonster] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
      context: { monsterBounds: BOUNDS },
    });

    expect(result.ok).toBe(false);
    expect(llmFn).toHaveBeenCalledTimes(3);
  });

  it('skips bounds validation when no monsterBounds provided', async () => {
    // Even a "wildly out of range" monster should pass if no bounds are given
    const anyMonster = { ...VALID_MONSTER, hp: 9999 };
    const llmFn = vi.fn().mockResolvedValue(makeRoomJson({ monsters: [anyMonster] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: ['north'],
      llmFn,
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tests for exit direction validation in generateRoom
// ---------------------------------------------------------------------------

describe('generateRoom — exit direction validation', () => {
  it('triggers retry when LLM returns an invalid exit direction', async () => {
    const allowable = ['north', 'south'];
    const llmFn = vi.fn()
      .mockResolvedValueOnce(makeRoomJson({ exits: ['north', 'northeast'] })) // invalid
      .mockResolvedValueOnce(makeRoomJson({ exits: ['north'] }));             // valid

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: allowable,
      llmFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.exits).toEqual(['north']);
    }
    expect(llmFn).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false when LLM always returns invalid exit directions (exhausts retries)', async () => {
    const allowable = ['north', 'south'];
    const llmFn = vi.fn().mockResolvedValue(makeRoomJson({ exits: ['northeast', 'through the archway'] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: allowable,
      llmFn,
    });

    expect(result.ok).toBe(false);
    expect(llmFn).toHaveBeenCalledTimes(3);
  });

  it('accepts a room where all exits are in allowableExits', async () => {
    const allowable = ['north', 'south', 'east'];
    const llmFn = vi.fn().mockResolvedValue(makeRoomJson({ exits: ['north', 'south'] }));

    const result = await generateRoom({
      coords: { x: 0, y: 0, z: 0 },
      allowableExits: allowable,
      llmFn,
    });

    expect(result.ok).toBe(true);
    expect(llmFn).toHaveBeenCalledTimes(1);
  });
});
