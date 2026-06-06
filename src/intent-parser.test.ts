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
