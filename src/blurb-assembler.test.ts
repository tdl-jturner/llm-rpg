import { describe, it, expect } from 'vitest';
import { assembleBlurb, type SceneryBlurb } from './blurb-assembler';

describe('assembleBlurb — fixed_description only', () => {
  it('returns fixed_description when provided', () => {
    const room = { fixed_description: 'A dusty stone chamber.' };
    expect(assembleBlurb(room)).toBe('A dusty stone chamber.');
  });

  it('returns empty string when fixed_description is empty', () => {
    const room = { fixed_description: '' };
    expect(assembleBlurb(room)).toBe('');
  });
});

describe('assembleBlurb — with scenery', () => {
  it('appends scenery room_blurbs in supplied order after fixed_description', () => {
    const scenery: SceneryBlurb[] = [
      { room_blurb: 'A cracked altar looms here.' },
      { room_blurb: 'Carved runes cover the walls.' },
    ];
    const result = assembleBlurb(
      { fixed_description: 'A dim stone chamber.' },
      { scenery },
    );
    expect(result).toBe(
      'A dim stone chamber.\nA cracked altar looms here.\nCarved runes cover the walls.',
    );
  });

  it('returns only fixed_description when scenery array is empty', () => {
    const result = assembleBlurb(
      { fixed_description: 'A dim room.' },
      { scenery: [] },
    );
    expect(result).toBe('A dim room.');
  });

  it('handles a single scenery item', () => {
    const result = assembleBlurb(
      { fixed_description: 'You enter a hall.' },
      { scenery: [{ room_blurb: 'A banner hangs here.' }] },
    );
    expect(result).toBe('You enter a hall.\nA banner hangs here.');
  });
});
