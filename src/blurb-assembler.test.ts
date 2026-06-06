import { describe, it, expect } from 'vitest';
import { assembleBlurb, type SceneryBlurb, type ItemBlurb } from './blurb-assembler';

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

describe('assembleBlurb — with items', () => {
  it('appends authored room_blurb when disturbed = false', () => {
    const items: ItemBlurb[] = [
      { name: 'rusty sword', room_blurb: 'A rusty sword lies across the altar.', disturbed: false },
    ];
    const result = assembleBlurb({ fixed_description: 'A dim chamber.' }, { items });
    expect(result).toBe('A dim chamber.\nA rusty sword lies across the altar.');
  });

  it('uses deterministic template when disturbed = true', () => {
    const items: ItemBlurb[] = [
      { name: 'rusty sword', room_blurb: 'A rusty sword lies across the altar.', disturbed: true },
    ];
    const result = assembleBlurb({ fixed_description: 'A dim chamber.' }, { items });
    expect(result).toBe('A dim chamber.\nA rusty sword lies on the floor here.');
  });

  it('items appear before scenery in output', () => {
    const items: ItemBlurb[] = [
      { name: 'dagger', room_blurb: 'A glinting dagger.', disturbed: false },
    ];
    const scenery: SceneryBlurb[] = [
      { room_blurb: 'A cracked altar looms here.' },
    ];
    const result = assembleBlurb({ fixed_description: 'Stone walls.' }, { items, scenery });
    expect(result).toBe('Stone walls.\nA glinting dagger.\nA cracked altar looms here.');
  });

  it('handles mixed disturbed/undisturbed items', () => {
    const items: ItemBlurb[] = [
      { name: 'longsword', room_blurb: 'An ornate longsword rests here.', disturbed: false },
      { name: 'dagger', room_blurb: 'A dagger is neatly placed.', disturbed: true },
    ];
    const result = assembleBlurb({ fixed_description: 'A vault.' }, { items });
    expect(result).toBe(
      'A vault.\nAn ornate longsword rests here.\nA dagger lies on the floor here.',
    );
  });

  it('returns only fixed_description when item list is empty', () => {
    const result = assembleBlurb({ fixed_description: 'A dim room.' }, { items: [] });
    expect(result).toBe('A dim room.');
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
