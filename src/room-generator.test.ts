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
});
