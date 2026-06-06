export interface Coords {
  x: number;
  y: number;
  z: number;
}

const OFFSETS: Record<string, Coords> = {
  north: { x: 0, y: 0, z: 1 },
  south: { x: 0, y: 0, z: -1 },
  east:  { x: 1, y: 0, z: 0 },
  west:  { x: -1, y: 0, z: 0 },
  up:    { x: 0, y: 1, z: 0 },
  down:  { x: 0, y: -1, z: 0 },
};

const RECIPROCALS: Record<string, string> = {
  north: 'south',
  south: 'north',
  east:  'west',
  west:  'east',
  up:    'down',
  down:  'up',
};

export function directionToOffset(direction: string): Coords {
  const offset = OFFSETS[direction];
  if (!offset) throw new Error(`Unknown direction: ${direction}`);
  return { ...offset };
}

export function reciprocalDirection(direction: string): string {
  const r = RECIPROCALS[direction];
  if (!r) throw new Error(`Unknown direction: ${direction}`);
  return r;
}

/**
 * Add two coordinate vectors together (pure, no DB access).
 * Used to compute the target coordinates when moving in a direction.
 */
export function addCoords(a: Coords, b: Coords): Coords {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Return true if two coordinate objects refer to the same cell.
 * Used to detect loop-closure (target coord already occupied by existing room).
 */
export function coordsEqual(a: Coords, b: Coords): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Given a set of exits a room already has (as a Set of direction strings),
 * determine whether a reciprocal back-exit needs to be added.
 *
 * Returns true  → the back-exit is missing and should be inserted.
 * Returns false → the back-exit already exists; no-op.
 *
 * This is a pure predicate so it can be unit-tested without any DB.
 */
export function needsRetroBackExit(existingExits: Set<string>, backDirection: string): boolean {
  return !existingExits.has(backDirection);
}
