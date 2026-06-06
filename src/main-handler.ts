import type { SubmitInputResponse } from './shared/ipc';
import { parseIntent } from './intent-parser';
import { assembleBlurb } from './blurb-assembler';
import { getRefusal } from './refusal-bank';
import { resolveTarget } from './target-resolver';
import type { Entity } from './target-resolver';
import type { WorldDB } from './world-db';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';

/**
 * Disambiguation state — persisted between calls while the player is resolving
 * an ambiguous target. Cleared after one resolution attempt (success or failure).
 */
interface DisambiguationState {
  candidates: Entity[];
  /** The original intent that triggered disambiguation ('look_at' | 'take') */
  pendingIntent: 'look_at' | 'take';
}

// Module-level disambiguation state (single player game — one session at a time)
let disambiguationState: DisambiguationState | null = null;

/** Exposed for testing — resets the disambiguation state. */
export function resetDisambiguationState(): void {
  disambiguationState = null;
}

/** Exposed for testing — returns current disambiguation state. */
export function getDisambiguationState(): DisambiguationState | null {
  return disambiguationState;
}

export async function handleSubmitInput(
  text: string,
  worldDB?: WorldDB,
  llmFn?: LLMFunction,
  logger?: EventLogger,
): Promise<SubmitInputResponse> {
  if (!worldDB) {
    // Fallback for tests that don't provide a DB
    return { narrative: [`> ${text}`] };
  }

  // ── Disambiguation resolution ──────────────────────────────────────────────
  if (disambiguationState) {
    const saved = disambiguationState;
    disambiguationState = null; // always clear, regardless of outcome

    const trimmed = text.trim().toLowerCase();
    const picked = saved.candidates.find((c) => c.name.toLowerCase() === trimmed);

    if (picked) {
      // Valid pick — resolve the original intent
      return { narrative: [`> ${text}`, resolveEntityIntent(saved.pendingIntent, picked)] };
    } else {
      // Invalid pick — cancel disambiguation and treat as fresh input
      // Fall through to normal intent parsing below
    }
  }

  const intent = parseIntent(text);
  const narrative: string[] = [`> ${text}`];

  switch (intent.type) {
    case 'look': {
      const room = worldDB.getCurrentRoom();
      const scenery = worldDB.getSceneryForRoom(room.id);
      narrative.push(assembleBlurb(room, { scenery }));
      break;
    }

    case 'look_at': {
      const room = worldDB.getCurrentRoom();
      const scenery = worldDB.getSceneryForRoom(room.id);
      const entities: Entity[] = scenery.map((s) => ({
        id: s.id,
        name: s.name,
        kind: 'scenery' as const,
        inspectionDescription: s.inspection_description,
        roomBlurb: s.room_blurb,
      }));

      const result = resolveTarget(intent.target, entities);

      if (result.type === 'no_match') {
        narrative.push(getRefusal('nothing_here_named'));
      } else if (result.type === 'unique') {
        narrative.push(result.entity.inspectionDescription);
      } else {
        // Ambiguous — enter disambiguation
        const candidateNames = result.candidates.map((c) => c.name).join(', ');
        narrative.push(`Which do you mean: ${candidateNames}?`);
        disambiguationState = { candidates: result.candidates, pendingIntent: 'look_at' };
      }
      break;
    }

    case 'take': {
      const room = worldDB.getCurrentRoom();
      const scenery = worldDB.getSceneryForRoom(room.id);
      const entities: Entity[] = scenery.map((s) => ({
        id: s.id,
        name: s.name,
        kind: 'scenery' as const,
        inspectionDescription: s.inspection_description,
        roomBlurb: s.room_blurb,
      }));

      const result = resolveTarget(intent.target, entities);

      if (result.type === 'no_match') {
        narrative.push(getRefusal('nothing_here_named'));
      } else if (result.type === 'unique') {
        if (result.entity.kind === 'scenery') {
          // Cannot take scenery — show the scenery's room_blurb as the refusal body
          narrative.push(result.entity.roomBlurb || getRefusal('cannot_take_scenery'));
        }
        // Other kinds (items, monsters) handled in later slices
      } else {
        // Ambiguous — enter disambiguation
        const candidateNames = result.candidates.map((c) => c.name).join(', ');
        narrative.push(`Which do you mean: ${candidateNames}?`);
        disambiguationState = { candidates: result.candidates, pendingIntent: 'take' };
      }
      break;
    }

    case 'move': {
      if (!llmFn) {
        // No LLM function provided — refuse movement (shouldn't happen at runtime)
        narrative.push(getRefusal('no_exit'));
        break;
      }

      const result = await worldDB.movePlayer(intent.direction, llmFn, logger);

      if (!result.ok) {
        if (result.reason === 'no_exit') {
          narrative.push(getRefusal('no_exit'));
        } else {
          // generation_failed (legacy path — currently unreachable since world-db
          // now falls back to the Liminal Gap room rather than returning this error)
          narrative.push(`Generation failed: ${result.error ?? 'unknown error'}`);
        }
      } else {
        const room = result.room;
        const scenery = worldDB.getSceneryForRoom(room.id);
        narrative.push(assembleBlurb(room, { scenery }));
        if (result.generationFailed) {
          narrative.push('(World generation hiccup logged.)');
        }
      }
      break;
    }

    case 'unknown':
    default: {
      narrative.push(getRefusal('intent_unparseable'));
      break;
    }
  }

  return { narrative };
}

/**
 * Resolves the original intent for a definitively-identified entity.
 * Used after disambiguation succeeds.
 */
function resolveEntityIntent(intentType: 'look_at' | 'take', entity: Entity): string {
  if (intentType === 'look_at') {
    return entity.inspectionDescription;
  }
  // take
  if (entity.kind === 'scenery') {
    return entity.roomBlurb || getRefusal('cannot_take_scenery');
  }
  // Future: items, monsters
  return getRefusal('cannot_take_scenery');
}
