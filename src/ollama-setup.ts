// ---------------------------------------------------------------------------
// OllamaSetup
//
// Startup check sequence:
//   1. Reachability — can we reach localhost:11434?
//   2. Model availability — are both configured model tags pulled?
// ---------------------------------------------------------------------------

import type { AppConfig } from './app-config';

// ---------------------------------------------------------------------------
// Injectable dependencies — default to real implementations
// ---------------------------------------------------------------------------

export interface OllamaSetupDeps {
  isReachable: () => Promise<boolean>;
  listModels: () => Promise<string[]>;
  /** Optional: send a prompt to a model and return the raw text response. */
  callModel?: (tag: string, prompt: string, jsonMode: boolean) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OllamaSetupResult =
  | { ok: true }
  | { ok: false; error: string; phase: 'reachability' | 'models' | 'smoke_test' };

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runOllamaSetup(
  config: AppConfig,
  deps: OllamaSetupDeps,
): Promise<OllamaSetupResult> {
  // ── 1. Reachability ───────────────────────────────────────────────────────
  const reachable = await deps.isReachable();
  if (!reachable) {
    return {
      ok: false,
      error: 'Cannot reach Ollama at http://localhost:11434. Is it running?',
      phase: 'reachability',
    };
  }

  // ── 2. Model availability ─────────────────────────────────────────────────
  let pulledModels: string[];
  try {
    pulledModels = await deps.listModels();
  } catch (e) {
    return {
      ok: false,
      error: `Failed to list Ollama models: ${e instanceof Error ? e.message : String(e)}`,
      phase: 'models',
    };
  }

  const requiredModels = [config.heavyModel, config.lightModel];
  const missingModels = requiredModels.filter((tag) => !pulledModels.includes(tag));

  if (missingModels.length > 0) {
    return {
      ok: false,
      error: `Missing models: ${missingModels.join(', ')}. Please pull them first.`,
      phase: 'models',
    };
  }

  // ── 3. Smoke test ─────────────────────────────────────────────────────────
  if (deps.callModel) {
    const SMOKE_PROMPT = 'Respond with exactly the JSON object {"ok": true}.';
    const MAX_ATTEMPTS = 3;

    for (const tag of requiredModels) {
      let passed = false;
      let lastError = '';

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const raw = await deps.callModel(tag, SMOKE_PROMPT, true);
          const parsed = JSON.parse(raw) as unknown;
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>)['ok'] === true
          ) {
            passed = true;
            break;
          }
          lastError = `Model "${tag}" returned unexpected shape: ${raw}`;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }

      if (!passed) {
        return {
          ok: false,
          error: `Smoke test failed for model "${tag}": ${lastError}`,
          phase: 'smoke_test',
        };
      }
    }
  }

  return { ok: true };
}
