// ---------------------------------------------------------------------------
// RoomGenerator
//
// Provides:
//   - createStubLLM: a deterministic "LLM" function that returns a canned
//     room JSON. Sleeps ~500ms by default to make the UX visible during stub
//     generation. Accepts { delayMs } option to override (e.g. 0 for tests).
//   - generateRoom: wraps the retry runner to produce a committed room payload.
// ---------------------------------------------------------------------------

import { runWithRetry } from './json-retry-runner';
import type { LLMFunction, RetryResult } from './json-retry-runner';
import type { Coords } from './grid-topology';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedRoom {
  name: string;
  fixed_description: string;
  exits: string[];
}

export type GenerateRoomResult =
  | { ok: true; room: GeneratedRoom }
  | { ok: false; error: string };

export interface GenerateRoomOptions {
  coords: Coords;
  /** The set of directions the new room is allowed to declare as exits. */
  allowableExits: string[];
  /** The LLM function to use (injected for testability). */
  llmFn: LLMFunction;
}

// ---------------------------------------------------------------------------
// JSON schema for a generated room
// ---------------------------------------------------------------------------

const ROOM_SCHEMA = {
  type: 'object',
  required: ['name', 'fixed_description', 'exits'],
  properties: {
    name: { type: 'string' },
    fixed_description: { type: 'string' },
    exits: { type: 'array', items: { type: 'string' } },
  },
};

// ---------------------------------------------------------------------------
// Deterministic stub LLM
// ---------------------------------------------------------------------------

export interface StubLLMOptions {
  /** How long to delay before resolving (milliseconds). Default: 500. */
  delayMs?: number;
}

/**
 * Returns a deterministic "LLM" function for use with the generation pipeline.
 * Parses the allowable exits from the prompt to produce a valid room JSON.
 * Sleeps `delayMs` milliseconds to make the UX spinner visible.
 */
export function createStubLLM(options: StubLLMOptions = {}): LLMFunction {
  const delay = options.delayMs ?? 500;

  return async (prompt: string): Promise<string> => {
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    // Extract coords from prompt (format: "(x,y,z)")
    const coordsMatch = prompt.match(/\((-?\d+),(-?\d+),(-?\d+)\)/);
    const coordsStr = coordsMatch
      ? `${coordsMatch[1]},${coordsMatch[2]},${coordsMatch[3]}`
      : '?,?,?';

    // Extract allowable exits from prompt (format: "allowable exits: north, south")
    const exitsMatch = prompt.match(/allowable exits:\s*([^\n.]+)/i);
    let exits: string[] = [];
    if (exitsMatch) {
      exits = exitsMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const room: GeneratedRoom = {
      name: `Generated Room (${coordsStr})`,
      fixed_description: 'You step into an unremarkable space.',
      exits,
    };

    return JSON.stringify(room);
  };
}

// ---------------------------------------------------------------------------
// generateRoom
// ---------------------------------------------------------------------------

/**
 * Generates a room at the given coordinates using the provided LLM function.
 * Returns the parsed room or an error if all retries fail.
 */
export async function generateRoom(options: GenerateRoomOptions): Promise<GenerateRoomResult> {
  const { coords, allowableExits, llmFn } = options;

  const prompt = buildGenerationPrompt(coords, allowableExits);

  const result: RetryResult<GeneratedRoom> = await runWithRetry<GeneratedRoom>({
    llmFn,
    schema: ROOM_SCHEMA,
    prompt,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Filter exits to only allowable ones (defensive)
  const filtered = result.value.exits.filter((e) => allowableExits.includes(e));

  return {
    ok: true,
    room: {
      name: result.value.name,
      fixed_description: result.value.fixed_description,
      exits: filtered,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGenerationPrompt(coords: Coords, allowableExits: string[]): string {
  const { x, y, z } = coords;
  return (
    `Generate a new room at coordinates (${x},${y},${z}).\n` +
    `The room must include exits ONLY from this list of allowable exits: ${allowableExits.join(', ')}.\n` +
    `You MUST respond with a single JSON object matching this schema:\n` +
    `{ "name": string, "fixed_description": string, "exits": string[] }\n` +
    `Do not include any other text, only the JSON object.`
  );
}
