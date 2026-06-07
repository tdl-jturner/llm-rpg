// ---------------------------------------------------------------------------
// AutoEquip
//
// Pure helper for auto-equip logic.
// Selects the best weapon from inventory and determines whether a newly
// picked-up weapon should replace the currently equipped one.
// ---------------------------------------------------------------------------

/** Fist damage range (unarmed) — used as baseline for auto-equip decisions. */
export const fistAvgDamage = 1.5; // (1 + 2) / 2

/** Minimal weapon shape needed for equip comparisons. */
export interface WeaponCandidate {
  id: number;
  damage_min: number;
  damage_max: number;
}

/** Average damage of a weapon candidate. */
export function avgDamage(w: WeaponCandidate): number {
  return (w.damage_min + w.damage_max) / 2;
}

/**
 * Selects the weapon with the highest average damage from the given list.
 * Returns null if the list is empty.
 * Ties are broken by picking the first item in the list (stable).
 */
export function selectBestWeapon(candidates: WeaponCandidate[]): WeaponCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, w) => (avgDamage(w) > avgDamage(best) ? w : best));
}

/**
 * Returns true if the newly-picked-up weapon should replace the currently
 * equipped one (or fist if no weapon is equipped).
 *
 * Rule: equip if avg_damage(newWeapon) > avg_damage(current ?? fist).
 */
export function shouldAutoEquip(
  current: WeaponCandidate | null,
  newWeapon: WeaponCandidate,
): boolean {
  const currentAvg = current ? avgDamage(current) : fistAvgDamage;
  return avgDamage(newWeapon) > currentAvg;
}

/** Minimal armor shape needed for equip comparisons. */
export interface ArmorCandidate {
  id: number;
  armor_value: number;
}

/**
 * Selects the armor piece with the highest armor_value from the given list.
 * Returns null if the list is empty.
 */
export function selectBestArmor(candidates: ArmorCandidate[]): ArmorCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, a) => (a.armor_value > best.armor_value ? a : best));
}

/**
 * Returns true if the newly-picked-up armor should replace the currently
 * equipped piece (or bare skin if nothing is equipped).
 *
 * Rule: equip if newArmor.armor_value > current.armor_value (or > 0 if unarmored).
 */
export function shouldAutoEquipArmor(
  current: ArmorCandidate | null,
  newArmor: ArmorCandidate,
): boolean {
  const currentValue = current ? current.armor_value : 0;
  return newArmor.armor_value > currentValue;
}
