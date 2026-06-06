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
