// ---------------------------------------------------------------------------
// OpenRouterSetup
//
// Startup check for the OpenRouter provider:
//   1. Verify an API key is configured
//   2. Confirm the key is valid by listing models (cheap, no token cost)
// ---------------------------------------------------------------------------

import type { AppConfig } from './app-config';

export type OpenRouterSetupResult =
  | { ok: true }
  | { ok: false; error: string; phase: 'auth' };

export async function runOpenRouterSetup(
  config: AppConfig,
): Promise<OpenRouterSetupResult> {
  if (!config.apiKey) {
    return {
      ok: false,
      error: 'No binding seal found. Inscribe your OpenRouter API key in the Chosen Minds section below.',
      phase: 'auth',
    };
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `The oracle rejects your seal — HTTP ${res.status}`,
        phase: 'auth',
      };
    }
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
