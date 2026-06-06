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

  // ── Smoke test ─────────────────────────────────────────────────────────────

  it('returns ok:true when callModel is not provided (smoke test skipped)', async () => {
    // makeDeps does not include callModel — backward compat
    const result = await runOllamaSetup(CONFIG, makeDeps());
    expect(result.ok).toBe(true);
  });

  it('returns ok:true when callModel succeeds for both models', async () => {
    const callModel = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }));
    const result = await runOllamaSetup(CONFIG, makeDeps({ callModel }));
    expect(result.ok).toBe(true);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it('returns smoke_test failure when callModel returns invalid JSON', async () => {
    const callModel = vi.fn().mockResolvedValue('not-json');
    const result = await runOllamaSetup(CONFIG, makeDeps({ callModel }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('smoke_test');
      expect(result.error).toContain('heavy:7b');
    }
  });

  it('returns smoke_test failure when callModel returns wrong shape', async () => {
    const callModel = vi.fn().mockResolvedValue(JSON.stringify({ ok: false }));
    const result = await runOllamaSetup(CONFIG, makeDeps({ callModel }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('smoke_test');
    }
  });

  it('returns smoke_test failure when callModel throws', async () => {
    const callModel = vi.fn().mockRejectedValue(new Error('model crashed'));
    const result = await runOllamaSetup(CONFIG, makeDeps({ callModel }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('smoke_test');
      expect(result.error).toContain('heavy:7b');
    }
  });
});
