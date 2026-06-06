// ---------------------------------------------------------------------------
// NlIntentParser
//
// LLM-based fallback for intent parsing. Called when the deterministic
// parseIntent returns { type: 'unknown' }.
//
// The LLM is prompted with the WORLD.md body + a role description and asked
// to classify the raw player input into a structured game command.
// Wrapped in JsonRetryRunner (3 attempts max).
// ---------------------------------------------------------------------------

import { runWithRetry } from './json-retry-runner';
import type { LLMFunction } from './json-retry-runner';
import type { Intent } from './intent-parser';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface NlParserOptions {
  /** The LLM function to call (injected for testability). */
  llmFn: LLMFunction;
  /** WORLD.md body text — used as system context in the prompt. */
  worldBody: string;
}

/**
 * Attempts to parse a raw player input string into an Intent using the LLM.
 *
 * Returns:
 *   - An Intent on success (may be { type: 'unknown' } if LLM returns NONE)
 *   - The string literal 'chained' when the input contains multiple commands
 */
export async function parseIntentWithNl(
  raw: string,
  options: NlParserOptions,
): Promise<Intent | 'chained'> {
  const { llmFn, worldBody } = options;

  const prompt = buildNlPrompt(raw, worldBody);

  // Wrap llmFn to intercept raw responses and detect array commands before
  // schema validation rejects them (schema requires command: string, but LLMs
  // sometimes return command: string[] for chained inputs).
  let chainedDetected = false;
  const interceptingLlmFn: LLMFunction = async (p: string) => {
    const raw = await llmFn(p);
    // Try to parse and check for array command
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as Record<string, unknown>)['command'])
      ) {
        chainedDetected = true;
      }
    } catch {
      // Let the retry runner handle parse errors
    }
    return raw;
  };

  const result = await runWithRetry<NlResponse>({
    llmFn: interceptingLlmFn,
    schema: NL_RESPONSE_SCHEMA,
    prompt,
    maxAttempts: 3,
  });

  if (chainedDetected) {
    return 'chained';
  }

  if (!result.ok) {
    return { type: 'unknown' };
  }

  const response = result.value;

  // Check for chained commands (comma-separated string)
  if (typeof response.command === 'string' && response.command.includes(',')) {
    return 'chained';
  }

  return mapResponseToIntent(response);
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface NlResponse {
  command: string | string[];
  direction?: string;
  target?: string;
  instrument?: string;
}

// ---------------------------------------------------------------------------
// JSON schema for the LLM response
// ---------------------------------------------------------------------------

const NL_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['command'],
  properties: {
    command: { type: 'string' },
    direction: { type: 'string' },
    target: { type: 'string' },
    instrument: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

const VALID_COMMANDS = ['MOVE', 'LOOK', 'LOOK_AT', 'TAKE', 'DROP', 'ATTACK', 'INVENTORY', 'NONE'];

function buildNlPrompt(raw: string, worldBody: string): string {
  const parts: string[] = [];

  if (worldBody) {
    parts.push(`WORLD CONTEXT:\n${worldBody}`);
    parts.push('');
  }

  parts.push(
    'You translate natural-language player input into a structured game command. ' +
    'Respond with ONLY a valid JSON object — no extra text, no markdown fences.',
  );
  parts.push('');

  parts.push(`Valid commands: ${VALID_COMMANDS.join(', ')}`);
  parts.push('');

  parts.push('Response schema:');
  parts.push(
    '{ "command": "<one of the valid commands above>", ' +
    '"direction": "<if MOVE: north|south|east|west|up|down>", ' +
    '"target": "<if LOOK_AT|TAKE|DROP|ATTACK: the target name>", ' +
    '"instrument": "<optional: tool/weapon mentioned by player>" }',
  );
  parts.push('');

  parts.push('Few-shot examples:');
  parts.push('Input: "grab the lantern"  →  { "command": "TAKE", "target": "lantern" }');
  parts.push('Input: "smack the goblin with my torch"  →  { "command": "ATTACK", "target": "goblin", "instrument": "torch" }');
  parts.push('Input: "head back the way I came"  →  { "command": "MOVE", "direction": "south" }');
  parts.push('Input: "examine the altar carefully"  →  { "command": "LOOK_AT", "target": "altar" }');
  parts.push('Input: "asdfghjkl"  →  { "command": "NONE" }');
  parts.push('');

  parts.push(`Player input: "${raw}"`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Response → Intent mapping
// ---------------------------------------------------------------------------

function mapResponseToIntent(response: NlResponse): Intent {
  const cmd = typeof response.command === 'string' ? response.command.toUpperCase() : 'NONE';
  const instrument = response.instrument;

  switch (cmd) {
    case 'MOVE':
      return addInstrument({ type: 'move', direction: (response.direction ?? '').toLowerCase() }, instrument);
    case 'LOOK':
      return addInstrument({ type: 'look' }, instrument);
    case 'LOOK_AT':
      return addInstrument({ type: 'look_at', target: response.target ?? '' }, instrument);
    case 'TAKE':
      return addInstrument({ type: 'take', target: response.target ?? '' }, instrument);
    case 'DROP':
      return addInstrument({ type: 'drop', target: response.target ?? '' }, instrument);
    case 'ATTACK':
      return addInstrument({ type: 'attack', target: response.target ?? null }, instrument);
    case 'INVENTORY':
      return addInstrument({ type: 'inventory' }, instrument);
    case 'NONE':
    default:
      return addInstrument({ type: 'unknown' }, instrument);
  }
}

function addInstrument(intent: Intent, instrument: string | undefined): Intent {
  if (instrument) {
    return { ...intent, instrument } as Intent;
  }
  return intent;
}
