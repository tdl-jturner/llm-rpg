import { describe, it, expect, vi } from 'vitest';
import { runOllamaSetup } from './ollama-setup';
import type { OllamaSetupDeps } from './ollama-setup';
import type { AppConfig } from './app-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG: AppConfig = {
  heavyModel: 'heavy:7b',
  lightModel: 'light:1b',
};

function makeDeps(overrides: Partial<OllamaSetupDeps> = {}): OllamaSetupDeps {
  return {
    isReachable: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue(['heavy:7b', 'light:1b']),
    callModel: vi.fn().mockResolvedValue('{"ok": true}'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runOllamaSetup', () => {
  it('returns ok:true when all checks pass', async () => {
    const result = await runOllamaSetup(CONFIG, makeDeps());
    expect(result.ok).toBe(true);
  });

  it('returns reachability failure when Ollama is unreachable', async () => {
    const deps = makeDeps({ isReachable: vi.fn().mockResolvedValue(false) });
    const result = await runOllamaSetup(CONFIG, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('reachability');
      expect(result.error).toContain('Cannot reach Ollama');
    }
  });

  it('returns models failure when a model is missing', async () => {
    const deps = makeDeps({
      // only the heavy model is present
      listModels: vi.fn().mockResolvedValue(['heavy:7b']),
    });
    const result = await runOllamaSetup(CONFIG, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('models');
      expect(result.error).toContain('light:1b');
    }
  });

  it('returns models failure when listModels throws', async () => {
    const deps = makeDeps({
      listModels: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const result = await runOllamaSetup(CONFIG, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('models');
    }
  });

  it('returns smoketest failure when model returns bad JSON', async () => {
    const deps = makeDeps({
      callModel: vi.fn().mockResolvedValue('not json at all'),
    });
    const result = await runOllamaSetup(CONFIG, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('smoketest');
    }
  });

  it('returns smoketest failure when model returns {"ok": false}', async () => {
    const deps = makeDeps({
      callModel: vi.fn().mockResolvedValue('{"ok": false}'),
    });
    const result = await runOllamaSetup(CONFIG, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('smoketest');
    }
  });

  it('calls callModel for both models during smoke test', async () => {
    const callModel = vi.fn().mockResolvedValue('{"ok": true}');
    const deps = makeDeps({ callModel });
    await runOllamaSetup(CONFIG, deps);
    // Should be called at least once for each model
    const calledTags = callModel.mock.calls.map((c) => c[0] as string);
    expect(calledTags).toContain('heavy:7b');
    expect(calledTags).toContain('light:1b');
  });

  it('logs llm.call events via optional logger', async () => {
    const logLlmCall = vi.fn();
    const logger = { logLlmCall };
    await runOllamaSetup(CONFIG, makeDeps(), logger);
    expect(logLlmCall).toHaveBeenCalledTimes(2);
    const firstCall = logLlmCall.mock.calls[0][0] as { model: string; ok: boolean };
    expect(firstCall.ok).toBe(true);
    expect(['heavy:7b', 'light:1b']).toContain(firstCall.model);
  });

  it('does not call callModel when reachability fails', async () => {
    const callModel = vi.fn();
    const deps = makeDeps({
      isReachable: vi.fn().mockResolvedValue(false),
      callModel,
    });
    await runOllamaSetup(CONFIG, deps);
    expect(callModel).not.toHaveBeenCalled();
  });

  it('does not call callModel when models are missing', async () => {
    const callModel = vi.fn();
    const deps = makeDeps({
      listModels: vi.fn().mockResolvedValue([]),
      callModel,
    });
    await runOllamaSetup(CONFIG, deps);
    expect(callModel).not.toHaveBeenCalled();
  });
});
