import { describe, it, expect } from 'vitest';
import {
  directionToOffset,
  reciprocalDirection,
  addCoords,
  coordsEqual,
  needsRetroBackExit,
  type Coords,
} from './grid-topology';

describe('directionToOffset', () => {
  it('north → z+1', () => {
    expect(directionToOffset('north')).toEqual<Coords>({ x: 0, y: 0, z: 1 });
  });

  it('south → z-1', () => {
    expect(directionToOffset('south')).toEqual<Coords>({ x: 0, y: 0, z: -1 });
  });

  it('east → x+1', () => {
    expect(directionToOffset('east')).toEqual<Coords>({ x: 1, y: 0, z: 0 });
  });

  it('west → x-1', () => {
    expect(directionToOffset('west')).toEqual<Coords>({ x: -1, y: 0, z: 0 });
  });

  it('up → y+1', () => {
    expect(directionToOffset('up')).toEqual<Coords>({ x: 0, y: 1, z: 0 });
  });

  it('down → y-1', () => {
    expect(directionToOffset('down')).toEqual<Coords>({ x: 0, y: -1, z: 0 });
  });
});

describe('reciprocalDirection', () => {
  it('north ↔ south', () => {
    expect(reciprocalDirection('north')).toBe('south');
    expect(reciprocalDirection('south')).toBe('north');
  });

  it('east ↔ west', () => {
    expect(reciprocalDirection('east')).toBe('west');
    expect(reciprocalDirection('west')).toBe('east');
  });

  it('up ↔ down', () => {
    expect(reciprocalDirection('up')).toBe('down');
    expect(reciprocalDirection('down')).toBe('up');
  });

  it('throws for unknown direction', () => {
    expect(() => reciprocalDirection('diagonal')).toThrow('Unknown direction');
  });
});

// ---------------------------------------------------------------------------
// addCoords — pure coordinate arithmetic used for target-coord computation
// ---------------------------------------------------------------------------

describe('addCoords', () => {
  it('adding the north offset advances z by 1', () => {
    const origin: Coords = { x: 0, y: 0, z: 0 };
    const northOffset = directionToOffset('north');
    expect(addCoords(origin, northOffset)).toEqual<Coords>({ x: 0, y: 0, z: 1 });
  });

  it('walking a full n→e→s→w loop returns to the origin', () => {
    // n e s w: net displacement = (0,0,1) + (1,0,0) + (0,0,-1) + (-1,0,0) = (0,0,0)
    const origin: Coords = { x: 0, y: 0, z: 0 };
    const directions = ['north', 'east', 'south', 'west'];
    const target = directions.reduce(
      (pos, dir) => addCoords(pos, directionToOffset(dir)),
      origin,
    );
    expect(coordsEqual(target, origin)).toBe(true);
  });

  it('handles negative coordinates', () => {
    const pos: Coords = { x: -3, y: 2, z: -1 };
    const result = addCoords(pos, directionToOffset('east'));
    expect(result).toEqual<Coords>({ x: -2, y: 2, z: -1 });
  });
});

// ---------------------------------------------------------------------------
// coordsEqual — coord-occupied lookup predicate
// ---------------------------------------------------------------------------

describe('coordsEqual', () => {
  it('returns true when all components match', () => {
    expect(coordsEqual({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(true);
  });

  it('returns false when x differs', () => {
    expect(coordsEqual({ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBe(false);
  });

  it('returns false when y differs', () => {
    expect(coordsEqual({ x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 })).toBe(false);
  });

  it('returns false when z differs', () => {
    expect(coordsEqual({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 })).toBe(false);
  });

  it('the origin matches itself', () => {
    const origin: Coords = { x: 0, y: 0, z: 0 };
    expect(coordsEqual(origin, { ...origin })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// needsRetroBackExit — retro-add-back-exit predicate
// ---------------------------------------------------------------------------

describe('needsRetroBackExit', () => {
  it('returns true when the back direction is absent from existing exits', () => {
    const existingExits = new Set(['north', 'east']);
    // player moved south into the existing room → back direction from existing room is 'north'
    // but let's say the existing room has no 'west' exit while we need 'west'
    expect(needsRetroBackExit(existingExits, 'west')).toBe(true);
  });

  it('returns false (no-op) when back direction already exists', () => {
    const existingExits = new Set(['north', 'south', 'east']);
    expect(needsRetroBackExit(existingExits, 'south')).toBe(false);
  });

  it('returns true for empty exit set', () => {
    expect(needsRetroBackExit(new Set<string>(), 'north')).toBe(true);
  });

  it('is case-sensitive (direction strings must match exactly)', () => {
    const existingExits = new Set(['North']); // wrong casing
    expect(needsRetroBackExit(existingExits, 'north')).toBe(true);
  });

  it('loop closure scenario: walking n then e then s then w — back direction from NE room is south; if missing, retro-add', () => {
    // The room at (1,0,1) was generated when moving east from (0,0,1).
    // Its exits might include only 'west' (back) and 'south'.
    // When we arrive from the west (moving east), back = 'west' — already present.
    // When loop closes by walking south from (1,0,1) to (1,0,0) which already exists,
    // back direction from (1,0,0) toward (1,0,1) is 'north'.
    // If (1,0,0) doesn't already have a 'north' exit, we should retro-add it.
    const existingExitsOfClosureRoom = new Set(['west']); // only has west so far
    expect(needsRetroBackExit(existingExitsOfClosureRoom, 'north')).toBe(true);
  });
});
