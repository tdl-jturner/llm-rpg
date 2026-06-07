// ---------------------------------------------------------------------------
// GoogleAIStudioSetup
//
// Startup check for the Google AI Studio provider:
//   1. Verify an API key is configured
//   2. Confirm the key is valid by listing models (cheap, no token cost)
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai';
import type { AppConfig } from './app-config';

export type GoogleAIStudioSetupResult =
  | { ok: true }
  | { ok: false; error: string; phase: 'auth' };

export async function runGoogleAIStudioSetup(
  config: AppConfig,
): Promise<GoogleAIStudioSetupResult> {
  if (!config.googleApiKey) {
    return {
      ok: false,
      error: 'No binding seal found. Inscribe your Google AI Studio API key in the Chosen Minds section below.',
      phase: 'auth',
    };
  }

  const ai = new GoogleGenAI({ apiKey: config.googleApiKey });
  try {
    const pager = await ai.models.list();
    // Consume the first result to confirm the call succeeded
    for await (const _ of pager) { break; }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `The oracle rejects your seal — ${msg}`,
      phase: 'auth',
    };
  }
}
