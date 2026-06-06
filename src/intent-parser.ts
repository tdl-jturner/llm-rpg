export type Intent =
  | { type: 'look' }
  | { type: 'move'; direction: string }
  | { type: 'unknown' };

const DIRECTIONS: Record<string, string> = {
  n: 'north',
  north: 'north',
  s: 'south',
  south: 'south',
  e: 'east',
  east: 'east',
  w: 'west',
  west: 'west',
  u: 'up',
  up: 'up',
  d: 'down',
  down: 'down',
};

export function parseIntent(raw: string): Intent {
  const text = raw.trim().toLowerCase();

  if (text === 'look' || text === 'l') {
    return { type: 'look' };
  }

  // Direct direction shortcut or long form
  if (DIRECTIONS[text] !== undefined) {
    return { type: 'move', direction: DIRECTIONS[text] };
  }

  // "go <direction>"
  const goMatch = text.match(/^go\s+(\S+)$/);
  if (goMatch) {
    const dir = DIRECTIONS[goMatch[1]];
    if (dir !== undefined) {
      return { type: 'move', direction: dir };
    }
  }

  return { type: 'unknown' };
}
