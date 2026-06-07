// ---------------------------------------------------------------------------
// CombatResolver
//
// Pure module: resolves one combat exchange between the player and a monster.
// No DB writes — caller applies the returned deltas.
//
// Damage roll: floor(rng() * (max - min + 1)) + min
// ---------------------------------------------------------------------------

export const FIST_DAMAGE_MIN = 1;
export const FIST_DAMAGE_MAX = 2;

/** Player stats needed for one combat exchange. */
export interface CombatPlayer {
  hp: number;
  max_hp: number;
  /** Equipped weapon damage_min; use FIST_DAMAGE_MIN if unarmed. */
  damage_min: number;
  /** Equipped weapon damage_max; use FIST_DAMAGE_MAX if unarmed. */
  damage_max: number;
  /** Flat damage reduction from equipped armor; 0 if unarmored. */
  armor_value: number;
}

/** Monster stats needed for one combat exchange. */
export interface CombatMonster {
  id: number;
  hp: number;
  max_hp: number;
  damage_min: number;
  damage_max: number;
}

export interface CombatResult {
  monster_dead: boolean;
  player_damage_dealt: number;
  monster_damage_dealt: number;
  player_died: boolean;
}

/** Random number generator: returns a float in [0, 1). Default: Math.random. */
export type Rng = () => number;

/**
 * Rolls a random integer in [min, max] inclusive using the provided rng.
 */
function rollDamage(min: number, max: number, rng: Rng): number {
  if (max <= min) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Resolves one exchange of combat.
 *
 * Flow:
 *  1. Player attacks monster: roll player damage.
 *  2. If monster dies → stop, return monster_dead=true, monster_damage_dealt=0.
 *  3. Otherwise monster retaliates: roll monster damage.
 *  4. If player HP - monster_damage_dealt <= 0 → player_died=true.
 */
export function resolveCombat(
  player: CombatPlayer,
  monster: CombatMonster,
  rng: Rng = Math.random,
): CombatResult {
  const player_damage_dealt = rollDamage(player.damage_min, player.damage_max, rng);

  const monsterHpAfter = monster.hp - player_damage_dealt;

  if (monsterHpAfter <= 0) {
    return {
      monster_dead: true,
      player_damage_dealt,
      monster_damage_dealt: 0,
      player_died: false,
    };
  }

  // Monster retaliates — flat armor reduction, floor at 0
  const rawMonsterDamage = rollDamage(monster.damage_min, monster.damage_max, rng);
  const monster_damage_dealt = Math.max(0, rawMonsterDamage - player.armor_value);
  const playerHpAfter = player.hp - monster_damage_dealt;

  return {
    monster_dead: false,
    player_damage_dealt,
    monster_damage_dealt,
    player_died: playerHpAfter <= 0,
  };
}
