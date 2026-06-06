import { describe, it, expect } from 'vitest';
import { createStubLLM, generateRoom } from './room-generator';

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
