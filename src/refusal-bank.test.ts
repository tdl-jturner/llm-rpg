import { describe, it, expect } from 'vitest';
import { getRefusal } from './refusal-bank';

describe('getRefusal', () => {
  it('returns no_exit refusal', () => {
    const r = getRefusal('no_exit');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('returns intent_unparseable refusal', () => {
    const r = getRefusal('intent_unparseable');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('returns a fallback for unknown keys', () => {
    // Should not throw, should return some string
    const r = getRefusal('nonexistent_key_xyz');
    expect(typeof r).toBe('string');
  });
});
