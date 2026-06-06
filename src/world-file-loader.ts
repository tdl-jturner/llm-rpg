import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const VALID_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
export type Direction = (typeof VALID_DIRECTIONS)[number];

export interface StartingRoomItem {
  name: string;
  inspection_description: string;
  room_blurb: string;
  damage_min: number;
  damage_max: number;
  type: string;
}

export interface StartingRoomMonster {
  name: string;
  inspection_description: string;
  room_blurb: string;
  hp: number;
  max_hp: number;
  damage_min: number;
  damage_max: number;
}

export interface StartingRoomScenery {
  name: string;
  inspection_description: string;
  room_blurb: string;
}

export interface StartingRoom {
  name: string;
  fixed_description: string;
  exits: Direction[];
  items?: StartingRoomItem[];
  monsters?: StartingRoomMonster[];
  scenery?: StartingRoomScenery[];
}

export interface WorldFile {
  title: string;
  startingRoom: StartingRoom;
  body: string;
  refusals?: Record<string, string>;
}

export type LoadWorldFileResult =
  | { ok: true; world: WorldFile }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate the contents of a WORLD.md string.
 * Returns a typed WorldFile on success, or a descriptive error string on failure.
 *
 * Note: WORLD.md is cached at world-load. Mid-session edits are not picked up.
 */
export function loadWorldFile(content: string): LoadWorldFileResult {
  // Split frontmatter from body
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { ok: false, error: 'No valid frontmatter found. File must start with --- delimiters.' };
  }

  const rawFrontmatter = match[1];
  const body = match[2] ?? '';

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(rawFrontmatter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Malformed YAML in frontmatter: ${msg}` };
  }

  if (!isObject(parsed)) {
    return { ok: false, error: 'Frontmatter must be a YAML object (mapping), not a list or scalar.' };
  }

  // Validate title
  if (typeof parsed['title'] !== 'string' || !parsed['title'].trim()) {
    return { ok: false, error: 'Missing required field: title (must be a non-empty string).' };
  }
  const title = parsed['title'] as string;

  // Validate starting_room
  if (!isObject(parsed['starting_room'])) {
    return {
      ok: false,
      error: 'Missing required field: starting_room (must be a YAML object).',
    };
  }
  const sr = parsed['starting_room'] as Record<string, unknown>;

  if (typeof sr['name'] !== 'string' || !sr['name'].trim()) {
    return { ok: false, error: 'Missing required field: starting_room.name (must be a non-empty string).' };
  }

  if (typeof sr['fixed_description'] !== 'string' || !sr['fixed_description'].trim()) {
    return {
      ok: false,
      error: 'Missing required field: starting_room.fixed_description (must be a non-empty string).',
    };
  }

  // Validate exits
  const exitsResult = validateExits(sr['exits']);
  if (!exitsResult.ok) {
    return { ok: false, error: exitsResult.error };
  }
  const exits = exitsResult.exits;

  // Optional: items
  let items: StartingRoomItem[] | undefined;
  if (sr['items'] !== undefined) {
    const itemsResult = validateItems(sr['items']);
    if (!itemsResult.ok) return { ok: false, error: itemsResult.error };
    items = itemsResult.items;
  }

  // Optional: monsters
  let monsters: StartingRoomMonster[] | undefined;
  if (sr['monsters'] !== undefined) {
    const monstersResult = validateMonsters(sr['monsters']);
    if (!monstersResult.ok) return { ok: false, error: monstersResult.error };
    monsters = monstersResult.monsters;
  }

  // Optional: scenery
  let scenery: StartingRoomScenery[] | undefined;
  if (sr['scenery'] !== undefined) {
    const sceneryResult = validateScenery(sr['scenery']);
    if (!sceneryResult.ok) return { ok: false, error: sceneryResult.error };
    scenery = sceneryResult.scenery;
  }

  // Optional: refusals
  let refusals: Record<string, string> | undefined;
  if (parsed['refusals'] !== undefined) {
    if (!isObject(parsed['refusals'])) {
      return { ok: false, error: 'refusals must be a YAML object mapping refusal keys to strings.' };
    }
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed['refusals'] as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        return { ok: false, error: `refusals.${k} must be a string.` };
      }
      r[k] = v;
    }
    refusals = r;
  }

  const startingRoom: StartingRoom = {
    name: sr['name'] as string,
    fixed_description: sr['fixed_description'] as string,
    exits,
    ...(items !== undefined ? { items } : {}),
    ...(monsters !== undefined ? { monsters } : {}),
    ...(scenery !== undefined ? { scenery } : {}),
  };

  return {
    ok: true,
    world: {
      title,
      startingRoom,
      body: body.trim(),
      ...(refusals !== undefined ? { refusals } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ExitsResult =
  | { ok: true; exits: Direction[] }
  | { ok: false; error: string };

function validateExits(raw: unknown): ExitsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'starting_room.exits must be a YAML list of direction strings.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: 'starting_room.exits must not be empty; at least one exit is required.' };
  }
  const exits: Direction[] = [];
  for (const item of raw) {
    if (!VALID_DIRECTIONS.includes(item as Direction)) {
      return {
        ok: false,
        error: `starting_room.exits contains invalid direction: "${item}". ` +
          `Valid directions are: ${VALID_DIRECTIONS.join(', ')}.`,
      };
    }
    exits.push(item as Direction);
  }
  return { ok: true, exits };
}

type ItemsResult =
  | { ok: true; items: StartingRoomItem[] }
  | { ok: false; error: string };

function validateItems(raw: unknown): ItemsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'starting_room.items must be a YAML list.' };
  }
  const items: StartingRoomItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isObject(item)) {
      return { ok: false, error: `starting_room.items[${i}] must be an object.` };
    }
    for (const field of ['name', 'inspection_description', 'room_blurb', 'type']) {
      if (typeof item[field] !== 'string') {
        return { ok: false, error: `starting_room.items[${i}].${field} must be a string.` };
      }
    }
    for (const field of ['damage_min', 'damage_max']) {
      if (typeof item[field] !== 'number') {
        return { ok: false, error: `starting_room.items[${i}].${field} must be a number.` };
      }
    }
    items.push({
      name: item['name'] as string,
      inspection_description: item['inspection_description'] as string,
      room_blurb: item['room_blurb'] as string,
      damage_min: item['damage_min'] as number,
      damage_max: item['damage_max'] as number,
      type: item['type'] as string,
    });
  }
  return { ok: true, items };
}

type MonstersResult =
  | { ok: true; monsters: StartingRoomMonster[] }
  | { ok: false; error: string };

function validateMonsters(raw: unknown): MonstersResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'starting_room.monsters must be a YAML list.' };
  }
  const monsters: StartingRoomMonster[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    if (!isObject(m)) {
      return { ok: false, error: `starting_room.monsters[${i}] must be an object.` };
    }
    for (const field of ['name', 'inspection_description', 'room_blurb']) {
      if (typeof m[field] !== 'string') {
        return { ok: false, error: `starting_room.monsters[${i}].${field} must be a string.` };
      }
    }
    for (const field of ['hp', 'max_hp', 'damage_min', 'damage_max']) {
      if (typeof m[field] !== 'number') {
        return { ok: false, error: `starting_room.monsters[${i}].${field} must be a number.` };
      }
    }
    monsters.push({
      name: m['name'] as string,
      inspection_description: m['inspection_description'] as string,
      room_blurb: m['room_blurb'] as string,
      hp: m['hp'] as number,
      max_hp: m['max_hp'] as number,
      damage_min: m['damage_min'] as number,
      damage_max: m['damage_max'] as number,
    });
  }
  return { ok: true, monsters };
}

type SceneryResult =
  | { ok: true; scenery: StartingRoomScenery[] }
  | { ok: false; error: string };

function validateScenery(raw: unknown): SceneryResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'starting_room.scenery must be a YAML list.' };
  }
  const scenery: StartingRoomScenery[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!isObject(s)) {
      return { ok: false, error: `starting_room.scenery[${i}] must be an object.` };
    }
    for (const field of ['name', 'inspection_description', 'room_blurb']) {
      if (typeof s[field] !== 'string') {
        return { ok: false, error: `starting_room.scenery[${i}].${field} must be a string.` };
      }
    }
    scenery.push({
      name: s['name'] as string,
      inspection_description: s['inspection_description'] as string,
      room_blurb: s['room_blurb'] as string,
    });
  }
  return { ok: true, scenery };
}
