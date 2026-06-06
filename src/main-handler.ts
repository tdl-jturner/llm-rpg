import type { SubmitInputResponse } from './shared/ipc';
import { parseIntent } from './intent-parser';
import { assembleBlurb } from './blurb-assembler';
import { getRefusal } from './refusal-bank';
import type { WorldDB } from './world-db';

export function handleSubmitInput(
  text: string,
  worldDB?: WorldDB,
): SubmitInputResponse {
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
      narrative.push(getRefusal('no_exit'));
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
