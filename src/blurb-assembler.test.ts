import { describe, it, expect } from 'vitest';
import { assembleBlurb } from './blurb-assembler';

describe('assembleBlurb (degenerate)', () => {
  it('returns fixed_description when provided', () => {
    const room = { fixed_description: 'A dusty stone chamber.' };
    expect(assembleBlurb(room)).toBe('A dusty stone chamber.');
  });

  it('returns empty string when fixed_description is empty', () => {
    const room = { fixed_description: '' };
    expect(assembleBlurb(room)).toBe('');
  });
});
