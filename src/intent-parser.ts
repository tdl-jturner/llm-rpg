export type Intent =
  | { type: 'look' }
  | { type: 'look_at'; target: string }
  | { type: 'take'; target: string }
  | { type: 'drop'; target: string }
  | { type: 'inventory' }
  | { type: 'move'; direction: string }
  | { type: 'attack'; target: string | null }
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

  // LOOK AT <target>
  const lookAtMatch = text.match(/^look\s+at\s+(.+)$/);
  if (lookAtMatch) {
    return { type: 'look_at', target: lookAtMatch[1].trim() };
  }

  // EXAMINE <target>
  const examineMatch = text.match(/^examine\s+(.+)$/);
  if (examineMatch) {
    return { type: 'look_at', target: examineMatch[1].trim() };
  }

  // X <target>  (adventure shorthand for examine — note: must come after direction check)
  const xMatch = text.match(/^x\s+(.+)$/);
  if (xMatch) {
    return { type: 'look_at', target: xMatch[1].trim() };
  }

  // TAKE / GET / GRAB <target>
  const takeMatch = text.match(/^(?:take|get|grab)\s+(.+)$/);
  if (takeMatch) {
    return { type: 'take', target: takeMatch[1].trim() };
  }

  // PICK UP <target>
  const pickUpMatch = text.match(/^pick\s+up\s+(.+)$/);
  if (pickUpMatch) {
    return { type: 'take', target: pickUpMatch[1].trim() };
  }

  // INVENTORY / I / INV
  if (text === 'inventory' || text === 'i' || text === 'inv') {
    return { type: 'inventory' };
  }

  // DROP <target>
  const dropMatch = text.match(/^drop\s+(.+)$/);
  if (dropMatch) {
    return { type: 'drop', target: dropMatch[1].trim() };
  }

  // ATTACK / FIGHT / HIT / KILL [<target>]
  const attackMatch = text.match(/^(?:attack|fight|hit|kill)(?:\s+(.+))?$/);
  if (attackMatch) {
    const target = attackMatch[1] ? attackMatch[1].trim() : null;
    return { type: 'attack', target };
  }

  return { type: 'unknown' };
}
