import { describe, it, expect } from 'vitest';
import { resolveCombat, FIST_DAMAGE_MIN, FIST_DAMAGE_MAX } from './combat-resolver';

describe('resolveCombat', () => {
  // Use a seeded random to get deterministic results
  function makeRng(values: number[]) {
    let i = 0;
    return () => values[i++ % values.length];
  }

  describe('player damage calculation', () => {
    it('uses weapon damage range when equipped', () => {
      // rng returns 0 → min damage, then 0 → min damage for monster
      const rng = makeRng([0, 0]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 3, damage_max: 7, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 2, damage_max: 4 },
        rng,
      );
      // Player rolls 0 → deals 3 damage (min of 3-7)
      expect(result.player_damage_dealt).toBe(3);
    });

    it('rolls damage uniformly between min and max (inclusive)', () => {
      // rng returns 1.0 → max damage
      const rng = makeRng([1 - Number.EPSILON, 0]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 3, damage_max: 7, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 2, damage_max: 4 },
        rng,
      );
      expect(result.player_damage_dealt).toBe(7);
    });

    it('uses fist damage (1-2) when unarmed', () => {
      const rng = makeRng([0, 0]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: FIST_DAMAGE_MIN, damage_max: FIST_DAMAGE_MAX, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 2, damage_max: 4 },
        rng,
      );
      expect(result.player_damage_dealt).toBe(1);
    });
  });

  describe('monster dies', () => {
    it('returns monster_dead: true when player damage >= monster hp', () => {
      // rng always returns 1 so player deals max damage
      const rng = makeRng([1 - Number.EPSILON]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 10, damage_max: 20, armor_value: 0 },
        { id: 1, hp: 5, max_hp: 5, damage_min: 2, damage_max: 4 },
        rng,
      );
      expect(result.monster_dead).toBe(true);
      expect(result.monster_damage_dealt).toBe(0);
      expect(result.player_died).toBe(false);
    });

    it('returns player_damage_dealt = monster hp when monster dies exactly', () => {
      // exactly-lethal hit
      const rng = makeRng([0]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 5, damage_max: 5, armor_value: 0 },
        { id: 1, hp: 5, max_hp: 5, damage_min: 2, damage_max: 4 },
        rng,
      );
      expect(result.monster_dead).toBe(true);
      expect(result.player_damage_dealt).toBe(5);
    });
  });

  describe('player dies', () => {
    it('returns player_died: true when monster damage >= player hp', () => {
      // 1st rng call → player does 1 (min), 2nd → monster does max
      const rng = makeRng([0, 1 - Number.EPSILON]);
      const result = resolveCombat(
        { hp: 3, max_hp: 20, damage_min: 1, damage_max: 1, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 5, damage_max: 10 },
        rng,
      );
      expect(result.monster_dead).toBe(false);
      expect(result.player_died).toBe(true);
      expect(result.monster_damage_dealt).toBeGreaterThanOrEqual(3);
    });

    it('player_died false when monster damage < player hp', () => {
      const rng = makeRng([0, 0]); // both deal min
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 2, damage_max: 4, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 1, damage_max: 2 },
        rng,
      );
      expect(result.player_died).toBe(false);
      expect(result.monster_dead).toBe(false);
    });
  });

  describe('both survive', () => {
    it('returns monster_dead: false, player_died: false', () => {
      const rng = makeRng([0, 0]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 1, damage_max: 3, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 1, damage_max: 2 },
        rng,
      );
      expect(result.monster_dead).toBe(false);
      expect(result.player_died).toBe(false);
    });
  });

  describe('edge: zero damage roll', () => {
    it('handles damage_min === damage_max === 0', () => {
      // weapon with 0-0 damage
      const rng = makeRng([0, 0]);
      const result = resolveCombat(
        { hp: 20, max_hp: 20, damage_min: 0, damage_max: 0, armor_value: 0 },
        { id: 1, hp: 50, max_hp: 50, damage_min: 0, damage_max: 0 },
        rng,
      );
      expect(result.player_damage_dealt).toBe(0);
      expect(result.monster_damage_dealt).toBe(0);
      expect(result.monster_dead).toBe(false);
      expect(result.player_died).toBe(false);
    });
  });
});
