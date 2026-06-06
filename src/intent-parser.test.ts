import { describe, it, expect } from 'vitest';
import { parseIntent, Intent } from './intent-parser';

describe('parseIntent', () => {
  describe('LOOK', () => {
    it('parses "look"', () => {
      expect(parseIntent('look')).toEqual<Intent>({ type: 'look' });
    });

    it('parses "l"', () => {
      expect(parseIntent('l')).toEqual<Intent>({ type: 'look' });
    });

    it('parses "LOOK" (case-insensitive)', () => {
      expect(parseIntent('LOOK')).toEqual<Intent>({ type: 'look' });
    });
  });

  describe('move directions', () => {
    const cases: Array<[string, string]> = [
      ['n', 'north'],
      ['north', 'north'],
      ['go north', 'north'],
      ['s', 'south'],
      ['south', 'south'],
      ['go south', 'south'],
      ['e', 'east'],
      ['east', 'east'],
      ['go east', 'east'],
      ['w', 'west'],
      ['west', 'west'],
      ['go west', 'west'],
      ['u', 'up'],
      ['up', 'up'],
      ['go up', 'up'],
      ['d', 'down'],
      ['down', 'down'],
      ['go down', 'down'],
    ];

    for (const [input, dir] of cases) {
      it(`parses "${input}" as move ${dir}`, () => {
        expect(parseIntent(input)).toEqual<Intent>({ type: 'move', direction: dir });
      });
    }

    it('is case-insensitive for directions', () => {
      expect(parseIntent('GO NORTH')).toEqual<Intent>({ type: 'move', direction: 'north' });
    });
  });

  describe('LOOK AT / EXAMINE / X', () => {
    it('parses "look at altar"', () => {
      expect(parseIntent('look at altar')).toEqual<Intent>({ type: 'look_at', target: 'altar' });
    });

    it('parses "LOOK AT altar" (case-insensitive, lowercased target)', () => {
      expect(parseIntent('LOOK AT ALTAR')).toEqual<Intent>({ type: 'look_at', target: 'altar' });
    });

    it('parses "examine iron door"', () => {
      expect(parseIntent('examine iron door')).toEqual<Intent>({
        type: 'look_at',
        target: 'iron door',
      });
    });

    it('parses "x altar"', () => {
      expect(parseIntent('x altar')).toEqual<Intent>({ type: 'look_at', target: 'altar' });
    });

    it('parses "X mossy wall" (case-insensitive)', () => {
      expect(parseIntent('X mossy wall')).toEqual<Intent>({
        type: 'look_at',
        target: 'mossy wall',
      });
    });

    it('parses multi-word target with "look at"', () => {
      expect(parseIntent('look at ancient stone altar')).toEqual<Intent>({
        type: 'look_at',
        target: 'ancient stone altar',
      });
    });
  });

  describe('TAKE / GET / GRAB / PICK UP', () => {
    it('parses "take sword"', () => {
      expect(parseIntent('take sword')).toEqual<Intent>({ type: 'take', target: 'sword' });
    });

    it('parses "TAKE SWORD" (case-insensitive, lowercased target)', () => {
      expect(parseIntent('TAKE SWORD')).toEqual<Intent>({ type: 'take', target: 'sword' });
    });

    it('parses "get iron key"', () => {
      expect(parseIntent('get iron key')).toEqual<Intent>({
        type: 'take',
        target: 'iron key',
      });
    });

    it('parses "grab dagger"', () => {
      expect(parseIntent('grab dagger')).toEqual<Intent>({ type: 'take', target: 'dagger' });
    });

    it('parses "pick up rusty sword"', () => {
      expect(parseIntent('pick up rusty sword')).toEqual<Intent>({
        type: 'take',
        target: 'rusty sword',
      });
    });

    it('parses multi-word target with "take"', () => {
      expect(parseIntent('take ancient amulet')).toEqual<Intent>({
        type: 'take',
        target: 'ancient amulet',
      });
    });
  });

  describe('unknown', () => {
    it('returns unknown for unrecognized input', () => {
      expect(parseIntent('xyzzy')).toEqual<Intent>({ type: 'unknown' });
    });

    it('returns unknown for empty string', () => {
      expect(parseIntent('')).toEqual<Intent>({ type: 'unknown' });
    });

    it('returns unknown for partial direction like "go"', () => {
      expect(parseIntent('go')).toEqual<Intent>({ type: 'unknown' });
    });
  });
});
