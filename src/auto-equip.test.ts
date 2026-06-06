import { describe, it, expect } from 'vitest';
import { selectBestWeapon, shouldAutoEquip, fistAvgDamage, type WeaponCandidate } from './auto-equip';

const FIST_AVG = fistAvgDamage; // 1.5

describe('selectBestWeapon', () => {
  it('returns null when inventory is empty', () => {
    expect(selectBestWeapon([])).toBeNull();
  });

  it('returns the single weapon when inventory has one item', () => {
    const sword: WeaponCandidate = { id: 1, damage_min: 3, damage_max: 7 };
    expect(selectBestWeapon([sword])).toBe(sword);
  });

  it('returns the weapon with highest average damage', () => {
    const dagger: WeaponCandidate = { id: 1, damage_min: 1, damage_max: 3 }; // avg 2
    const sword: WeaponCandidate = { id: 2, damage_min: 4, damage_max: 8 };  // avg 6
    const mace: WeaponCandidate = { id: 3, damage_min: 2, damage_max: 6 };   // avg 4
    expect(selectBestWeapon([dagger, sword, mace])).toBe(sword);
  });

  it('returns the first weapon on ties (stable selection)', () => {
    const a: WeaponCandidate = { id: 1, damage_min: 2, damage_max: 4 }; // avg 3
    const b: WeaponCandidate = { id: 2, damage_min: 2, damage_max: 4 }; // avg 3
    expect(selectBestWeapon([a, b])).toBe(a);
  });

  it('selects weapon over fist even if weapon avg equals fist avg', () => {
    // fist avg is 1.5; a weapon with avg 1.5 (min=1, max=2) should still be selected
    const tiny: WeaponCandidate = { id: 1, damage_min: 1, damage_max: 2 }; // avg 1.5
    expect(selectBestWeapon([tiny])).toBe(tiny);
  });
});

describe('shouldAutoEquip', () => {
  it('fistAvgDamage is 1.5', () => {
    expect(FIST_AVG).toBe(1.5);
  });

  it('auto-equips when no weapon equipped (fist)', () => {
    const sword: WeaponCandidate = { id: 1, damage_min: 2, damage_max: 4 };
    expect(shouldAutoEquip(null, sword)).toBe(true);
  });

  it('auto-equips when new weapon has higher avg damage', () => {
    const current: WeaponCandidate = { id: 1, damage_min: 1, damage_max: 3 }; // avg 2
    const newWeapon: WeaponCandidate = { id: 2, damage_min: 3, damage_max: 7 }; // avg 5
    expect(shouldAutoEquip(current, newWeapon)).toBe(true);
  });

  it('does NOT auto-equip when new weapon has equal avg damage', () => {
    const current: WeaponCandidate = { id: 1, damage_min: 3, damage_max: 7 }; // avg 5
    const equal: WeaponCandidate = { id: 3, damage_min: 4, damage_max: 6 }; // avg 5
    expect(shouldAutoEquip(current, equal)).toBe(false);
  });

  it('does NOT auto-equip when new weapon has lower avg damage', () => {
    const current: WeaponCandidate = { id: 1, damage_min: 3, damage_max: 7 }; // avg 5
    const weaker: WeaponCandidate = { id: 2, damage_min: 1, damage_max: 3 }; // avg 2
    expect(shouldAutoEquip(current, weaker)).toBe(false);
  });
});
