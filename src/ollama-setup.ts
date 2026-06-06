// ---------------------------------------------------------------------------
// OllamaSetup
//
// Orchestrates the startup check sequence:
//   1. Reachability — can we reach localhost:11434?
//   2. Model availability — are both configured model tags pulled?
//   3. Smoke test — does each model return valid JSON from a trivial prompt?
//
// The smoke test runs through JsonRetryRunner with real LLM calls and logs
// each exchange as an `llm.call` event.
// ---------------------------------------------------------------------------

import { runWithRetry } from './json-retry-runner';
import type { AppConfig } from './app-config';

// ---------------------------------------------------------------------------
// Injectable dependencies — default to real implementations
// ---------------------------------------------------------------------------

export interface OllamaSetupDeps {
  isReachable: () => Promise<boolean>;
  listModels: () => Promise<string[]>;
  callModel: (tag: string, prompt: string, jsonMode: boolean) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Logger interface — minimal subset used here
// ---------------------------------------------------------------------------

export interface SetupLogger {
  logLlmCall(event: LlmCallEvent): void;
}

export interface LlmCallEvent {
  model: string;
  prompt: string;
  response: string;
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OllamaSetupResult =
  | { ok: true }
  | { ok: false; error: string; phase: 'reachability' | 'models' | 'smoketest' };

// ---------------------------------------------------------------------------
// Smoke test schema
// ---------------------------------------------------------------------------

const SMOKE_SCHEMA = {
  type: 'object',
  required: ['ok'] as readonly string[],
  properties: {
    ok: { type: 'boolean' },
  },
} as const;

const SMOKE_PROMPT = 'Respond with exactly the JSON object {"ok": true}.';

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runOllamaSetup(
  config: AppConfig,
  deps: OllamaSetupDeps,
  logger?: SetupLogger,
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

  // ── 3. Smoke test — both models ───────────────────────────────────────────
  for (const tag of requiredModels) {
    const llmFn = async (prompt: string): Promise<string> => {
      const response = await deps.callModel(tag, prompt, true);
      logger?.logLlmCall({ model: tag, prompt, response, ok: true });
      return response;
    };

    const result = await runWithRetry<{ ok: boolean }>({
      llmFn,
      schema: SMOKE_SCHEMA,
      prompt: SMOKE_PROMPT,
      maxAttempts: 3,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: `Smoke test failed for model "${tag}": ${result.error}`,
        phase: 'smoketest',
      };
    }

    if (!result.value.ok) {
      return {
        ok: false,
        error: `Smoke test for model "${tag}" returned {"ok": false} instead of {"ok": true}.`,
        phase: 'smoketest',
      };
    }
  }

  return { ok: true };
}
