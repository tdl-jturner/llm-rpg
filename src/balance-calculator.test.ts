import { describe, it, expect } from 'vitest';
import { computeMonsterBounds, FIST_DAMAGE_MIN, FIST_DAMAGE_MAX } from './balance-calculator';

describe('computeMonsterBounds', () => {
  const PLAYER_MAX_HP = 20;

  describe('fist (unarmed) — avg 1.5', () => {
    it('returns hp_min = round(1.5 * 5) = 8', () => {
      const bounds = computeMonsterBounds(FIST_DAMAGE_MIN, FIST_DAMAGE_MAX, PLAYER_MAX_HP);
      expect(bounds.hp_min).toBe(8);
    });

    it('returns hp_max = round(1.5 * 10) = 15', () => {
      const bounds = computeMonsterBounds(FIST_DAMAGE_MIN, FIST_DAMAGE_MAX, PLAYER_MAX_HP);
      expect(bounds.hp_max).toBe(15);
    });

    it('returns monster damage so it can kill player in 5–10 hits', () => {
      const bounds = computeMonsterBounds(FIST_DAMAGE_MIN, FIST_DAMAGE_MAX, PLAYER_MAX_HP);
      // avg_monster_damage * [5, 10] ≈ player_max_hp
      // damage_min: round(player_max_hp / 10) = 2
      // damage_max: round(player_max_hp / 5) = 4
      expect(bounds.damage_min).toBe(2);
      expect(bounds.damage_max).toBe(4);
    });

    it('returns drop damage bounds as modest variety around player weapon avg', () => {
      const bounds = computeMonsterBounds(FIST_DAMAGE_MIN, FIST_DAMAGE_MAX, PLAYER_MAX_HP);
      // drop damage is based on current weapon avg (1.5 for fist)
      // drop_damage_min = max(1, round(avg * 0.75)) = max(1, round(1.125)) = max(1, 1) = 1
      // drop_damage_max = round(avg * 1.5) = round(2.25) = 2
      expect(bounds.drop_damage_min).toBe(1);
      expect(bounds.drop_damage_max).toBe(2);
    });
  });

  describe('small weapon — damage 1–3, avg 2', () => {
    it('returns hp_min = round(2 * 5) = 10', () => {
      const bounds = computeMonsterBounds(1, 3, PLAYER_MAX_HP);
      expect(bounds.hp_min).toBe(10);
    });

    it('returns hp_max = round(2 * 10) = 20', () => {
      const bounds = computeMonsterBounds(1, 3, PLAYER_MAX_HP);
      expect(bounds.hp_max).toBe(20);
    });

    it('returns monster damage_min = round(20/10) = 2', () => {
      const bounds = computeMonsterBounds(1, 3, PLAYER_MAX_HP);
      expect(bounds.damage_min).toBe(2);
    });

    it('returns monster damage_max = round(20/5) = 4', () => {
      const bounds = computeMonsterBounds(1, 3, PLAYER_MAX_HP);
      expect(bounds.damage_max).toBe(4);
    });
  });

  describe('large weapon — damage 5–10, avg 7.5', () => {
    it('returns hp_min = round(7.5 * 5) = 38', () => {
      const bounds = computeMonsterBounds(5, 10, PLAYER_MAX_HP);
      expect(bounds.hp_min).toBe(38);
    });

    it('returns hp_max = round(7.5 * 10) = 75', () => {
      const bounds = computeMonsterBounds(5, 10, PLAYER_MAX_HP);
      expect(bounds.hp_max).toBe(75);
    });

    it('returns drop_damage_min = max(1, round(7.5 * 0.75)) = max(1, 6) = 6', () => {
      const bounds = computeMonsterBounds(5, 10, PLAYER_MAX_HP);
      expect(bounds.drop_damage_min).toBe(6);
    });

    it('returns drop_damage_max = round(7.5 * 1.5) = round(11.25) = 11', () => {
      const bounds = computeMonsterBounds(5, 10, PLAYER_MAX_HP);
      expect(bounds.drop_damage_max).toBe(11);
    });
  });

  describe('edge case: weapon avg that rounds to 0 damage', () => {
    it('drop_damage_min is at least 1', () => {
      // very weak weapon: 0-0 (hypothetical)
      const bounds = computeMonsterBounds(0, 0, PLAYER_MAX_HP);
      expect(bounds.drop_damage_min).toBeGreaterThanOrEqual(1);
    });
  });
});
