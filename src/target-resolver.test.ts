import { describe, it, expect } from 'vitest';
import { resolveTarget, type Entity } from './target-resolver';

// ---------------------------------------------------------------------------
// Tests for TargetResolver
// ---------------------------------------------------------------------------

const makeScenery = (name: string): Entity => ({
  id: Math.random(),
  name,
  kind: 'scenery',
  inspectionDescription: `Inspection of ${name}.`,
  roomBlurb: `${name} is here.`,
});

describe('resolveTarget — no match', () => {
  it('returns no_match when entity list is empty', () => {
    const result = resolveTarget('altar', []);
    expect(result.type).toBe('no_match');
  });

  it('returns no_match when no entity name contains the target substring', () => {
    const entities = [makeScenery('iron door'), makeScenery('mossy wall')];
    const result = resolveTarget('altar', entities);
    expect(result.type).toBe('no_match');
  });
});

describe('resolveTarget — unique match', () => {
  it('matches exactly one entity by exact name', () => {
    const entities = [makeScenery('iron door'), makeScenery('mossy wall')];
    const result = resolveTarget('iron door', entities);
    expect(result.type).toBe('unique');
    if (result.type === 'unique') {
      expect(result.entity.name).toBe('iron door');
    }
  });

  it('matches by prefix (partial name from start)', () => {
    const entities = [makeScenery('iron door'), makeScenery('mossy wall')];
    const result = resolveTarget('iron', entities);
    expect(result.type).toBe('unique');
    if (result.type === 'unique') {
      expect(result.entity.name).toBe('iron door');
    }
  });

  it('matches by substring (partial name not from start)', () => {
    const entities = [makeScenery('iron door'), makeScenery('mossy wall')];
    const result = resolveTarget('door', entities);
    expect(result.type).toBe('unique');
    if (result.type === 'unique') {
      expect(result.entity.name).toBe('iron door');
    }
  });

  it('is case-insensitive', () => {
    const entities = [makeScenery('Iron Door')];
    const result = resolveTarget('IRON DOOR', entities);
    expect(result.type).toBe('unique');
  });

  it('matches multi-word target', () => {
    const entities = [makeScenery('ancient stone altar'), makeScenery('rusted gate')];
    const result = resolveTarget('stone altar', entities);
    expect(result.type).toBe('unique');
    if (result.type === 'unique') {
      expect(result.entity.name).toBe('ancient stone altar');
    }
  });
});

describe('resolveTarget — ambiguous match', () => {
  it('returns ambiguous when two entities both match', () => {
    const entities = [makeScenery('iron door'), makeScenery('iron gate')];
    const result = resolveTarget('iron', entities);
    expect(result.type).toBe('ambiguous');
    if (result.type === 'ambiguous') {
      expect(result.candidates.length).toBe(2);
      const names = result.candidates.map((e) => e.name);
      expect(names).toContain('iron door');
      expect(names).toContain('iron gate');
    }
  });

  it('candidate list preserves original order', () => {
    const entities = [
      makeScenery('iron door'),
      makeScenery('iron gate'),
      makeScenery('iron maiden'),
    ];
    const result = resolveTarget('iron', entities);
    expect(result.type).toBe('ambiguous');
    if (result.type === 'ambiguous') {
      expect(result.candidates.map((e) => e.name)).toEqual([
        'iron door',
        'iron gate',
        'iron maiden',
      ]);
    }
  });
});
