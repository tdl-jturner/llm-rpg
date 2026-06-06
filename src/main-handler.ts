import type { SubmitInputResponse } from './shared/ipc';
import { parseIntent } from './intent-parser';
import { assembleBlurb } from './blurb-assembler';
import { getRefusal } from './refusal-bank';
import type { WorldDB } from './world-db';
import type { LLMFunction } from './json-retry-runner';
import type { EventLogger } from './event-logger';

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

  const intent = parseIntent(text);
  const narrative: string[] = [`> ${text}`];

  switch (intent.type) {
    case 'look': {
      const room = worldDB.getCurrentRoom();
      narrative.push(assembleBlurb(room));
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
        narrative.push(assembleBlurb(result.room));
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
