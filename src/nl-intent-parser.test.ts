import { describe, it, expect, vi } from 'vitest';
import { parseIntentWithNl } from './nl-intent-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a mock LLMFunction that returns a single pre-canned JSON string. */
function makeLlmFn(responseJson: string) {
  return vi.fn().mockResolvedValue(responseJson);
}

const WORLD_BODY = 'A dark fantasy world full of monsters and treasure.';

// ---------------------------------------------------------------------------
// Command mapping
// ---------------------------------------------------------------------------

describe('parseIntentWithNl – command mapping', () => {
  it('maps LLM TAKE response to take intent with target', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'TAKE', target: 'lantern' }));

    const result = await parseIntentWithNl('grab the lantern', {
      llmFn,
      worldBody: WORLD_BODY,
    });

    expect(result).toEqual({ type: 'take', target: 'lantern' });
  });

  it('maps LLM MOVE response to move intent with lowercased direction', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'MOVE', direction: 'NORTH' }));

    const result = await parseIntentWithNl('head back the way I came', {
      llmFn,
      worldBody: WORLD_BODY,
    });

    expect(result).toEqual({ type: 'move', direction: 'north' });
  });

  it('maps LLM LOOK to look intent', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'LOOK' }));
    const result = await parseIntentWithNl('what do I see?', { llmFn, worldBody: WORLD_BODY });
    expect(result).toEqual({ type: 'look' });
  });

  it('maps LLM LOOK_AT to look_at intent', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'LOOK_AT', target: 'altar' }));
    const result = await parseIntentWithNl('examine the altar carefully', { llmFn, worldBody: WORLD_BODY });
    expect(result).toEqual({ type: 'look_at', target: 'altar' });
  });

  it('maps LLM DROP to drop intent', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'DROP', target: 'torch' }));
    const result = await parseIntentWithNl('toss the torch', { llmFn, worldBody: WORLD_BODY });
    expect(result).toEqual({ type: 'drop', target: 'torch' });
  });

  it('maps LLM ATTACK to attack intent with target', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'ATTACK', target: 'goblin' }));
    const result = await parseIntentWithNl('smack the goblin', { llmFn, worldBody: WORLD_BODY });
    expect(result).toEqual({ type: 'attack', target: 'goblin' });
  });

  it('maps LLM INVENTORY to inventory intent', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'INVENTORY' }));
    const result = await parseIntentWithNl('what am I carrying?', { llmFn, worldBody: WORLD_BODY });
    expect(result).toEqual({ type: 'inventory' });
  });

  it('maps LLM NONE to unknown intent', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'NONE' }));
    const result = await parseIntentWithNl('asdfghjkl', { llmFn, worldBody: WORLD_BODY });
    expect(result).toEqual({ type: 'unknown' });
  });
});

// ---------------------------------------------------------------------------
// Chained commands
// ---------------------------------------------------------------------------

describe('parseIntentWithNl – chained commands', () => {
  it('returns "chained" when LLM returns comma-separated command string', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'TAKE,MOVE' }));
    const result = await parseIntentWithNl('take the lantern and head north', { llmFn, worldBody: WORLD_BODY });
    expect(result).toBe('chained');
  });

  it('returns "chained" when LLM returns command as an array', async () => {
    // Schema allows string only, but we need to handle the edge case at runtime
    const llmFn = vi.fn().mockResolvedValue(JSON.stringify({ command: ['TAKE', 'MOVE'] }));
    const result = await parseIntentWithNl('take the lantern and go north', { llmFn, worldBody: WORLD_BODY });
    expect(result).toBe('chained');
  });
});

// ---------------------------------------------------------------------------
// Retry exhaustion
// ---------------------------------------------------------------------------

describe('parseIntentWithNl – retry exhaustion', () => {
  it('returns unknown intent when all retries are exhausted', async () => {
    const llmFn = vi.fn().mockResolvedValue('not valid json at all!!!');

    const result = await parseIntentWithNl('xyzzy', { llmFn, worldBody: WORLD_BODY });

    expect(result).toEqual({ type: 'unknown' });
    expect(llmFn).toHaveBeenCalledTimes(3); // 3 attempts
  });
});

// ---------------------------------------------------------------------------
// Instrument field
// ---------------------------------------------------------------------------

describe('parseIntentWithNl – instrument field', () => {
  it('preserves instrument field on the returned intent', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'ATTACK', target: 'goblin', instrument: 'torch' }));

    const result = await parseIntentWithNl('smack the goblin with my torch', {
      llmFn,
      worldBody: WORLD_BODY,
    });

    expect(result).toEqual({ type: 'attack', target: 'goblin', instrument: 'torch' });
  });

  it('does not add instrument field when LLM does not return one', async () => {
    const llmFn = makeLlmFn(JSON.stringify({ command: 'TAKE', target: 'sword' }));

    const result = await parseIntentWithNl('grab the sword', { llmFn, worldBody: WORLD_BODY });

    expect(result).toEqual({ type: 'take', target: 'sword' });
    expect((result as { instrument?: string }).instrument).toBeUndefined();
  });
});
