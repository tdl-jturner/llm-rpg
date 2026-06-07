import { describe, it, expect } from 'vitest';
import { getRefusal, getUnknownRefusalKeys } from './refusal-bank';

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

  it('returns a real default for generation_failed (not the unknown-key sentinel)', () => {
    const r = getRefusal('generation_failed');
    expect(r).not.toMatch(/Unknown refusal/);
    expect(r.length).toBeGreaterThan(0);
  });

  it('generation_failed override is applied when provided', () => {
    const r = getRefusal('generation_failed', { generation_failed: 'The void shudders.' });
    expect(r).toBe('The void shudders.');
  });

  // ── Override map ────────────────────────────────────────────────────────────

  it('returns override when key exists in the override map', () => {
    const r = getRefusal('no_exit', { no_exit: 'The way is shut.' });
    expect(r).toBe('The way is shut.');
  });

  it('returns default when key is not in the override map', () => {
    const defaultMsg = getRefusal('no_exit');
    const r = getRefusal('no_exit', { intent_unparseable: 'Huh?' });
    expect(r).toBe(defaultMsg);
  });

  it('handles a partial override map — overrides some keys, defaults for others', () => {
    const overrides = { no_exit: 'No passage.', intent_unparseable: 'Pardon?' };
    expect(getRefusal('no_exit', overrides)).toBe('No passage.');
    expect(getRefusal('intent_unparseable', overrides)).toBe('Pardon?');
    // nothing_here_named is not in overrides — should get default
    const defaultNhn = getRefusal('nothing_here_named');
    expect(getRefusal('nothing_here_named', overrides)).toBe(defaultNhn);
  });

  it('returns default when override map is empty', () => {
    const defaultMsg = getRefusal('no_exit');
    expect(getRefusal('no_exit', {})).toBe(defaultMsg);
  });

  it('ignores unknown keys in the override map', () => {
    const defaultMsg = getRefusal('no_exit');
    // 'totally_unknown' in overrides should not affect 'no_exit'
    expect(getRefusal('no_exit', { totally_unknown: 'x' })).toBe(defaultMsg);
  });
});

describe('getUnknownRefusalKeys', () => {
  it('returns empty array when all keys are valid', () => {
    const result = getUnknownRefusalKeys({ no_exit: 'x', intent_unparseable: 'y' });
    expect(result).toEqual([]);
  });

  it('returns unknown keys', () => {
    const result = getUnknownRefusalKeys({ no_exit: 'x', bogus_key: 'y', another_bad: 'z' });
    expect(result).toContain('bogus_key');
    expect(result).toContain('another_bad');
    expect(result).not.toContain('no_exit');
  });

  it('returns empty array for empty input', () => {
    expect(getUnknownRefusalKeys({})).toEqual([]);
  });

  it('treats nothing_to_take as an unknown key (removed — nothing_here_named covers the same scenario)', () => {
    const result = getUnknownRefusalKeys({ nothing_to_take: 'x' });
    expect(result).toContain('nothing_to_take');
  });
});
