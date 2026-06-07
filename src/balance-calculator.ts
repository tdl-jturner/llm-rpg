// ---------------------------------------------------------------------------
// BalanceCalculator
//
// Pure module: computes HP and damage bounds for newly-generated monsters,
// calibrated to the player's current weapon (or fist if unarmed).
//
// Formulas:
//   monster_hp_min = round(avg_player_damage × 5)
//   monster_hp_max = round(avg_player_damage × 10)
//   monster_damage_min = round(player_max_hp / 10)   (dies in ≤10 hits)
//   monster_damage_max = round(player_max_hp / 5)    (dies in ≥5 hits)
//   drop_damage_min = max(1, round(avg_player_damage × 0.75))
//   drop_damage_max = round(avg_player_damage × 1.5)
//   armor_value_min = max(1, round(avg_monster_damage × 0.25))
//   armor_value_max = max(1, round(avg_monster_damage × 0.35))
// ---------------------------------------------------------------------------

export const FIST_DAMAGE_MIN = 1;
export const FIST_DAMAGE_MAX = 2;

export interface MonsterBounds {
  /** Minimum HP the generated monster should have. */
  hp_min: number;
  /** Maximum HP the generated monster should have. */
  hp_max: number;
  /** Minimum damage-per-hit the monster should deal. */
  damage_min: number;
  /** Maximum damage-per-hit the monster should deal. */
  damage_max: number;
  /** Minimum damage of the monster's drop weapon. */
  drop_damage_min: number;
  /** Maximum damage of the monster's drop weapon. */
  drop_damage_max: number;
  /** Minimum armor_value for a generated armor piece in this room. */
  armor_value_min: number;
  /** Maximum armor_value for a generated armor piece in this room. */
  armor_value_max: number;
}

/**
 * Computes balance bounds for a new monster.
 *
 * @param weaponDamageMin  The player's equipped weapon damage_min (use FIST_DAMAGE_MIN if unarmed).
 * @param weaponDamageMax  The player's equipped weapon damage_max (use FIST_DAMAGE_MAX if unarmed).
 * @param playerMaxHp      The player's max HP.
 */
export function computeMonsterBounds(
  weaponDamageMin: number,
  weaponDamageMax: number,
  playerMaxHp: number,
): MonsterBounds {
  const avgPlayerDamage = (weaponDamageMin + weaponDamageMax) / 2;

  const hp_min = Math.round(avgPlayerDamage * 5);
  const hp_max = Math.round(avgPlayerDamage * 10);

  const damage_min = Math.round(playerMaxHp / 10);
  const damage_max = Math.round(playerMaxHp / 5);

  const drop_damage_min = Math.max(1, Math.round(avgPlayerDamage * 0.75));
  const drop_damage_max = Math.round(avgPlayerDamage * 1.5);

  const avgMonsterDamage = (damage_min + damage_max) / 2;
  const armor_value_min = Math.max(1, Math.round(avgMonsterDamage * 0.25));
  const armor_value_max = Math.max(1, Math.round(avgMonsterDamage * 0.35));

  return { hp_min, hp_max, damage_min, damage_max, drop_damage_min, drop_damage_max, armor_value_min, armor_value_max };
}
