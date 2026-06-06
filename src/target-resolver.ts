// ---------------------------------------------------------------------------
// TargetResolver
//
// Resolves a target string from a parsed intent against a scope (list of
// in-scope entities). Returns one of:
//   - unique: exactly one entity matched
//   - ambiguous: multiple entities matched (with candidate list)
//   - no_match: no entity matched
//
// Matching is case-insensitive substring/prefix — i.e. the target must appear
// anywhere within the entity name.
// ---------------------------------------------------------------------------

export type EntityKind = 'scenery' | 'item' | 'monster';

export interface Entity {
  id: number;
  name: string;
  kind: EntityKind;
  inspectionDescription: string;
  /** Used for LOOK output and TAKE-refusal display (scenery). */
  roomBlurb: string;
}

export type TargetResolveResult =
  | { type: 'unique'; entity: Entity }
  | { type: 'ambiguous'; candidates: Entity[] }
  | { type: 'no_match' };

/**
 * Resolves a player-typed target string against a list of in-scope entities.
 *
 * @param target    - The raw target string from the player (e.g. "iron door")
 * @param entities  - All in-scope entities to match against
 */
export function resolveTarget(target: string, entities: Entity[]): TargetResolveResult {
  const needle = target.trim().toLowerCase();

  const matches = entities.filter((e) => e.name.toLowerCase().includes(needle));

  if (matches.length === 0) return { type: 'no_match' };
  if (matches.length === 1) return { type: 'unique', entity: matches[0] };
  return { type: 'ambiguous', candidates: matches };
}
