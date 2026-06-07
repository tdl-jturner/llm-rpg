import { describe, it, expect, vi } from 'vitest';
import { runWithRetry } from './json-retry-runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A JSON schema for a simple room object */
const ROOM_SCHEMA = {
  type: 'object',
  required: ['name', 'fixed_description', 'exits'],
  properties: {
    name: { type: 'string' },
    fixed_description: { type: 'string' },
    exits: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
} as const;

type RoomResponse = {
  name: string;
  fixed_description: string;
  exits: string[];
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JsonRetryRunner', () => {
  it('returns parsed result on first successful attempt', async () => {
    const validJson = JSON.stringify({
      name: 'Cave',
      fixed_description: 'A dark cave.',
      exits: ['north'],
    });

    const llmFn = vi.fn().mockResolvedValue(validJson);

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Cave');
      expect(result.value.exits).toEqual(['north']);
    }
    expect(llmFn).toHaveBeenCalledTimes(1);
  });

  it('returns parsed result after one retry (first attempt returns bad JSON)', async () => {
    const validJson = JSON.stringify({
      name: 'Hall',
      fixed_description: 'A grand hall.',
      exits: ['south', 'east'],
    });

    const llmFn = vi.fn()
      .mockResolvedValueOnce('not valid json {{{')
      .mockResolvedValueOnce(validJson);

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Hall');
    }
    expect(llmFn).toHaveBeenCalledTimes(2);
  });

  it('returns terminal failure after 3 attempts all return bad JSON', async () => {
    const llmFn = vi.fn().mockResolvedValue('garbage not json');

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
    });

    expect(result.ok).toBe(false);
    expect(llmFn).toHaveBeenCalledTimes(3);
  });

  it('each retry prompt contains the previous bad output and a structured error', async () => {
    const validJson = JSON.stringify({
      name: 'Dungeon',
      fixed_description: 'Grim.',
      exits: ['west'],
    });

    const capturedPrompts: string[] = [];
    const llmFn = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompts.push(prompt);
      if (capturedPrompts.length < 2) return 'bad json !!!';
      return validJson;
    });

    await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
    });

    expect(capturedPrompts).toHaveLength(2);
    // First prompt is the base prompt
    expect(capturedPrompts[0]).toBe('Generate a room.');
    // Second prompt includes the bad output and an error description
    expect(capturedPrompts[1]).toContain('bad json !!!');
    expect(capturedPrompts[1]).toContain('error');
  });

  it('returns failure when response is valid JSON but fails schema validation', async () => {
    // Missing required field "exits"
    const badSchema = JSON.stringify({ name: 'Room', fixed_description: 'Desc.' });
    const llmFn = vi.fn().mockResolvedValue(badSchema);

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
    });

    expect(result.ok).toBe(false);
    expect(llmFn).toHaveBeenCalledTimes(3);
  });

  it('succeeds after schema-invalid response followed by valid one', async () => {
    const badJson = JSON.stringify({ name: 'Room' }); // missing exits + fixed_description
    const goodJson = JSON.stringify({
      name: 'Vault',
      fixed_description: 'A vault.',
      exits: ['up'],
    });

    const llmFn = vi.fn()
      .mockResolvedValueOnce(badJson)
      .mockResolvedValueOnce(goodJson);

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Vault');
    }
  });

  // ---------------------------------------------------------------------------
  // Custom validate hook
  // ---------------------------------------------------------------------------

  it('succeeds on retry when first response fails custom validate', async () => {
    const badJson = JSON.stringify({
      name: 'Room',
      fixed_description: 'Bad room.',
      exits: ['north'],
    });
    const goodJson = JSON.stringify({
      name: 'Good Room',
      fixed_description: 'Good room.',
      exits: ['south'],
    });

    const llmFn = vi.fn()
      .mockResolvedValueOnce(badJson)
      .mockResolvedValueOnce(goodJson);

    let validateCallCount = 0;
    const validate = (value: RoomResponse): string | null => {
      validateCallCount++;
      // Fail the first call (exits must be ['south'])
      if (value.exits[0] !== 'south') {
        return `exits must be ['south'], got ${JSON.stringify(value.exits)}`;
      }
      return null;
    };

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
      validate,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Good Room');
    }
    expect(llmFn).toHaveBeenCalledTimes(2);
    expect(validateCallCount).toBe(2);
  });

  it('retry prompt includes custom validation error message', async () => {
    const badJson = JSON.stringify({
      name: 'Room',
      fixed_description: 'Desc.',
      exits: ['north'],
    });
    const goodJson = JSON.stringify({
      name: 'Fixed Room',
      fixed_description: 'Fixed.',
      exits: ['south'],
    });

    const capturedPrompts: string[] = [];
    const llmFn = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompts.push(prompt);
      return capturedPrompts.length === 1 ? badJson : goodJson;
    });

    await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
      validate: (v) => (v.exits[0] !== 'south' ? 'exits must be south' : null),
    });

    expect(capturedPrompts).toHaveLength(2);
    expect(capturedPrompts[1]).toContain('exits must be south');
  });

  it('returns failure when validate always fails (all 3 attempts)', async () => {
    const json = JSON.stringify({
      name: 'Room',
      fixed_description: 'Desc.',
      exits: ['north'],
    });

    const llmFn = vi.fn().mockResolvedValue(json);

    const result = await runWithRetry<RoomResponse>({
      llmFn,
      schema: ROOM_SCHEMA,
      prompt: 'Generate a room.',
      validate: () => 'always fails',
    });

    expect(result.ok).toBe(false);
    expect(llmFn).toHaveBeenCalledTimes(3);
  });
});
