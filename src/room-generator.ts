// ---------------------------------------------------------------------------
// RoomGenerator
//
// Provides:
//   - createStubLLM: a deterministic "LLM" function that returns a canned
//     room JSON. Sleeps ~500ms by default to make the UX visible during stub
//     generation. Accepts { delayMs } option to override (e.g. 0 for tests).
//   - createRealLLM: wraps callModel from ollama-client to produce a real LLM
//     function that logs each call via an optional EventLogger.
//   - generateRoom: wraps the retry runner to produce a committed room payload.
//   - buildGenerationPrompt: exported for testing; builds the prompt with full
//     world context so the model can produce on-tone prose rooms.
//   - LIMINAL_GAP_ROOM: the fallback room inserted when generation fails.
// ---------------------------------------------------------------------------

import { runWithRetry } from './json-retry-runner';
import type { LLMFunction, RetryResult } from './json-retry-runner';
import type { Coords } from './grid-topology';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedSceneryItem {
  name: string;
  inspection_description: string;
  room_blurb: string;
}

export interface GeneratedWeaponItem {
  name: string;
  inspection_description: string;
  room_blurb: string;
  damage_min: number;
  damage_max: number;
  type: 'weapon';
}

export interface GeneratedMonsterDrop {
  name: string;
  inspection_description: string;
  /** Authored blurb used when the drop appears in the room after monster death. */
  room_blurb: string;
  damage_min: number;
  damage_max: number;
}

export interface GeneratedMonster {
  name: string;
  inspection_description: string;
  room_blurb: string;
  hp: number;
  damage_min: number;
  damage_max: number;
  drop: GeneratedMonsterDrop;
}

export interface GeneratedRoom {
  name: string;
  fixed_description: string;
  exits: string[];
  scenery?: GeneratedSceneryItem[];
  items?: GeneratedWeaponItem[];
  monsters?: GeneratedMonster[];
}

export type GenerateRoomResult =
  | { ok: true; room: GeneratedRoom }
  | { ok: false; error: string };

/** Per-direction neighbor state text passed into the prompt. */
export type NeighborState = Record<string, string>;

/**
 * Contextual inputs gathered by the engine before invoking the Room
 * Generation Skill.  All fields are optional — callers that lack them
 * (e.g. tests) may omit them and the prompt will degrade gracefully.
 */
export interface RoomGenerationContext {
  /** The full WORLD.md body (verbatim) used as system prompt context. */
  worldBody?: string;
  /** The fixed_description of the room the player just left. */
  previousRoomDescription?: string;
  /** The direction the player traveled to arrive at the new cell. */
  directionTraveled?: string;
  /**
   * For each cardinal neighbour, one of:
   *   "empty"
   *   "existing room named <name>"
   *   "forced back-exit to previous room"
   */
  neighborState?: NeighborState;
  /** Balance bounds for monster generation — if omitted, monsters may be skipped. */
  monsterBounds?: MonsterBoundsContext;
}

export interface MonsterBoundsContext {
  hp_min: number;
  hp_max: number;
  damage_min: number;
  damage_max: number;
  drop_damage_min: number;
  drop_damage_max: number;
}

export interface GenerateRoomOptions {
  coords: Coords;
  /** The set of directions the new room is allowed to declare as exits. */
  allowableExits: string[];
  /** The LLM function to use (injected for testability). */
  llmFn: LLMFunction;
  /** Optional context for richer prompt building. */
  context?: RoomGenerationContext;
}

/** Minimal logger interface used by createRealLLM — avoids a hard dependency on EventLogger. */
export interface LLMCallLogger {
  logLlmCall(event: { model: string; prompt: string; response: string; ok: boolean }): void;
}

// ---------------------------------------------------------------------------
// Liminal Gap fallback room
// ---------------------------------------------------------------------------

/**
 * Inserted when all generation retries are exhausted.
 * The back-exit (forced by the engine) is the only exit allowed.
 */
export const LIMINAL_GAP_ROOM: GeneratedRoom = {
  name: 'A Liminal Gap',
  fixed_description:
    'A featureless gray space presses in around you. The way back is clear; nothing else is.',
  exits: [],
  scenery: [],
  items: [],
  monsters: [],
};

// ---------------------------------------------------------------------------
// JSON schema for a generated room
// ---------------------------------------------------------------------------

const ROOM_SCHEMA = {
  type: 'object',
  required: ['name', 'fixed_description', 'exits', 'scenery', 'items', 'monsters'],
  properties: {
    name: { type: 'string' },
    fixed_description: { type: 'string' },
    exits: { type: 'array', items: { type: 'string' } },
    scenery: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'inspection_description', 'room_blurb'],
        properties: {
          name: { type: 'string' },
          inspection_description: { type: 'string' },
          room_blurb: { type: 'string' },
        },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'inspection_description', 'room_blurb', 'damage_min', 'damage_max', 'type'],
        properties: {
          name: { type: 'string' },
          inspection_description: { type: 'string' },
          room_blurb: { type: 'string' },
          damage_min: { type: 'number' },
          damage_max: { type: 'number' },
          type: { type: 'string' },
        },
      },
    },
    monsters: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'inspection_description', 'room_blurb', 'hp', 'damage_min', 'damage_max', 'drop'],
        properties: {
          name: { type: 'string' },
          inspection_description: { type: 'string' },
          room_blurb: { type: 'string' },
          hp: { type: 'number' },
          damage_min: { type: 'number' },
          damage_max: { type: 'number' },
          drop: {
            type: 'object',
            required: ['name', 'inspection_description', 'room_blurb', 'damage_min', 'damage_max'],
            properties: {
              name: { type: 'string' },
              inspection_description: { type: 'string' },
              room_blurb: { type: 'string' },
              damage_min: { type: 'number' },
              damage_max: { type: 'number' },
            },
          },
        },
      },
    },
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
      scenery: [],
      items: [],
      monsters: [],
    };

    return JSON.stringify(room);
  };
}

// ---------------------------------------------------------------------------
// Real LLM (wraps ollama-client callModel)
// ---------------------------------------------------------------------------

/**
 * Creates an LLMFunction that calls the given model via the provided
 * callModel function (injected for testability).
 *
 * Each call is optionally logged via the `logger`.
 *
 * @param modelTag   - Ollama model identifier, e.g. "qwen3.5:9b"
 * @param callModel  - Injectable: (tag, prompt, jsonMode) => Promise<string>
 * @param logger     - Optional logger that receives each LLM call event
 */
export function createRealLLM(
  modelTag: string,
  callModel: (tag: string, prompt: string, jsonMode: boolean) => Promise<string>,
  logger?: LLMCallLogger,
): LLMFunction {
  return async (prompt: string): Promise<string> => {
    let response = '';
    let ok = false;
    try {
      response = await callModel(modelTag, prompt, true);
      ok = true;
    } catch (err) {
      logger?.logLlmCall({ model: modelTag, prompt, response: '', ok: false });
      throw err;
    }
    logger?.logLlmCall({ model: modelTag, prompt, response, ok });
    return response;
  };
}

// ---------------------------------------------------------------------------
// buildGenerationPrompt (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Builds the full prompt sent to the LLM for room generation.
 *
 * @param coords        - Target coordinates (used for orientation only)
 * @param allowableExits - Directions the generated room may declare
 * @param context       - Rich world/navigation context
 */
export function buildGenerationPrompt(
  coords: Coords,
  allowableExits: string[],
  context: RoomGenerationContext = {},
): string {
  const { x, y, z } = coords;
  const {
    worldBody,
    previousRoomDescription,
    directionTraveled,
    neighborState = {},
    monsterBounds,
  } = context;

  const parts: string[] = [];

  // ── System context: world flavour ─────────────────────────────────────────
  if (worldBody) {
    parts.push(
      `WORLD CONTEXT (use this to shape the tone, atmosphere, and vocabulary of the room):\n${worldBody}`,
    );
    parts.push('');
  }

  // ── Role ──────────────────────────────────────────────────────────────────
  parts.push(
    'You are a room description writer for a text adventure game. ' +
    'Write in second person, present tense, 2–4 sentences. ' +
    'Describe architecture and atmosphere ONLY. ' +
    'Do NOT name items, monsters, or named characters in fixed_description.',
  );
  parts.push('');

  // ── Navigation context ────────────────────────────────────────────────────
  if (previousRoomDescription) {
    parts.push(`The player arrived by traveling ${directionTraveled ?? 'here'} from this room:`);
    parts.push(`"${previousRoomDescription}"`);
    parts.push('');
  }

  // ── Neighbor state ────────────────────────────────────────────────────────
  const neighborEntries = Object.entries(neighborState);
  if (neighborEntries.length > 0) {
    parts.push('Neighboring cells:');
    for (const [dir, state] of neighborEntries) {
      parts.push(`  ${dir}: ${state}`);
    }
    parts.push('');
  }

  // ── Generation instruction ────────────────────────────────────────────────
  parts.push(`Generate a new room at grid coordinates (${x},${y},${z}).`);
  parts.push(
    `The room may declare exits ONLY from this allowable list: ${allowableExits.join(', ')}.`,
  );
  parts.push('Include only exits that make spatial/narrative sense given the neighbors above.');
  parts.push('');

  // ── JSON schema instruction ───────────────────────────────────────────────
  parts.push('Respond with ONLY a valid JSON object matching this schema (no extra text):');
  parts.push(
    '{ "name": string, "fixed_description": string, "exits": string[], ' +
    '"scenery": [{ "name": string, "inspection_description": string, "room_blurb": string }], ' +
    '"items": [{ "name": string, "inspection_description": string, "room_blurb": string, ' +
    '"damage_min": number, "damage_max": number, "type": "weapon" }], ' +
    '"monsters": [{ "name": string, "inspection_description": string, "room_blurb": string, ' +
    '"hp": number, "damage_min": number, "damage_max": number, ' +
    '"drop": { "name": string, "inspection_description": string, "room_blurb": string, ' +
    '"damage_min": number, "damage_max": number } }] }',
  );
  parts.push(
    'Include 0–3 scenery items (permanent fixtures like furniture, carvings, doors, torches). ' +
    '"room_blurb" is a 1-sentence presence note for the LOOK view. ' +
    '"inspection_description" is 2–3 sentences of close detail when the player examines it.',
  );
  parts.push(
    'Include 0–3 items (weapons a player can pick up: swords, daggers, axes, maces, etc.). ' +
    'For each item, set damage_min and damage_max (e.g. a dagger: 1-3, a sword: 3-7). ' +
    '"room_blurb" describes where the item is found in the room. ' +
    '"inspection_description" is 2–3 sentences of close detail when examined. ' +
    'type must always be "weapon".',
  );

  // ── Monster generation instruction ───────────────────────────────────────
  if (monsterBounds) {
    parts.push('');
    parts.push(
      `Include 0 or 1 monster (hostile creature) in the "monsters" array. ` +
      `About 50% of rooms should have a monster. ` +
      `Monster hp MUST be between ${monsterBounds.hp_min} and ${monsterBounds.hp_max}. ` +
      `Monster damage_min MUST be ${monsterBounds.damage_min}, damage_max MUST be ${monsterBounds.damage_max}. ` +
      `The monster's "drop" is a weapon that appears after the monster dies; ` +
      `drop damage_min MUST be between ${monsterBounds.drop_damage_min} and ${monsterBounds.drop_damage_max}, ` +
      `drop damage_max MUST be between ${monsterBounds.drop_damage_min} and ${monsterBounds.drop_damage_max}. ` +
      `"room_blurb" for the monster is a 1-sentence description of its presence in the room. ` +
      `"inspection_description" is 2–3 sentences when examined. ` +
      `The drop's "room_blurb" is written for AFTER the monster is dead (e.g. "A rusty sword lies where the goblin fell."). ` +
      `If no monster is desired, use an empty array.`,
    );
  } else {
    parts.push('Include an empty "monsters" array: [].');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// generateRoom
// ---------------------------------------------------------------------------

/**
 * Generates a room at the given coordinates using the provided LLM function.
 * Returns the parsed room or an error if all retries fail.
 */
export async function generateRoom(options: GenerateRoomOptions): Promise<GenerateRoomResult> {
  const { coords, allowableExits, llmFn, context } = options;

  const prompt = buildGenerationPrompt(coords, allowableExits, context);

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
      scenery: result.value.scenery ?? [],
      items: result.value.items ?? [],
      monsters: result.value.monsters ?? [],
    },
  };
}
