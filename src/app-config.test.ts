import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig } from './app-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-config-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('creates config.json with defaults when file does not exist', () => {
    const config = loadConfig(tmpDir);
    expect(config.provider).toBe('ollama');
    expect(config.heavyModel).toBe('qwen3.5:9b');
    expect(config.lightModel).toBe('gemma4:e2b');
    expect(config.apiKey).toBe('');

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.provider).toBe('ollama');
    expect(written.heavyModel).toBe('qwen3.5:9b');
    expect(written.lightModel).toBe('gemma4:e2b');
    expect(written.apiKey).toBe('');
  });

  it('returns existing config when file is present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        provider: 'google-ai-studio',
        heavyModel: 'gemini-2.5-flash',
        lightModel: 'gemini-2.5-flash',
        apiKey: 'AIzaTest',
      }),
      'utf-8',
    );
    const config = loadConfig(tmpDir);
    expect(config.provider).toBe('google-ai-studio');
    expect(config.heavyModel).toBe('gemini-2.5-flash');
    expect(config.lightModel).toBe('gemini-2.5-flash');
    expect(config.apiKey).toBe('AIzaTest');
  });

  it('merges missing keys with defaults when partial config is on disk', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ heavyModel: 'partial-heavy:13b' }),
      'utf-8',
    );
    const config = loadConfig(tmpDir);
    expect(config.heavyModel).toBe('partial-heavy:13b');
    expect(config.lightModel).toBe('gemma4:e2b'); // filled from defaults
    expect(config.provider).toBe('ollama'); // filled from defaults
    expect(config.apiKey).toBe(''); // filled from defaults
  });

  it('recovers from corrupt JSON by returning defaults', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{ invalid json', 'utf-8');
    const config = loadConfig(tmpDir);
    expect(config.provider).toBe('ollama');
    expect(config.heavyModel).toBe('qwen3.5:9b');
    expect(config.lightModel).toBe('gemma4:e2b');
    expect(config.apiKey).toBe('');
  });

  it('writes back the merged config so the file stays up to date', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ heavyModel: 'old:7b' }),
      'utf-8',
    );
    loadConfig(tmpDir);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.lightModel).toBe('gemma4:e2b');
    expect(written.provider).toBe('ollama');
    expect(written.apiKey).toBe('');
  });
});

describe('saveConfig', () => {
  it('writes the given config to config.json', () => {
    const config = { provider: 'ollama' as const, heavyModel: 'llama3:70b', lightModel: 'phi3:mini', apiKey: '' };
    saveConfig(tmpDir, config);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.provider).toBe('ollama');
    expect(written.heavyModel).toBe('llama3:70b');
    expect(written.lightModel).toBe('phi3:mini');
    expect(written.apiKey).toBe('');
  });

  it('saves google-ai-studio config with API key', () => {
    const config = {
      provider: 'google-ai-studio' as const,
      heavyModel: 'gemini-2.5-flash',
      lightModel: 'gemini-2.5-flash',
      apiKey: 'AIzaSyTest',
    };
    saveConfig(tmpDir, config);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.provider).toBe('google-ai-studio');
    expect(written.apiKey).toBe('AIzaSyTest');
  });

  it('overwrites an existing config.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ provider: 'ollama', heavyModel: 'old-heavy:7b', lightModel: 'old-light:1b', apiKey: '' }),
      'utf-8',
    );
    saveConfig(tmpDir, { provider: 'ollama', heavyModel: 'new-heavy:13b', lightModel: 'new-light:3b', apiKey: '' });
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.heavyModel).toBe('new-heavy:13b');
    expect(written.lightModel).toBe('new-light:3b');
  });

  it('creates parent directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested');
    saveConfig(nested, { provider: 'ollama', heavyModel: 'a:1b', lightModel: 'b:1b', apiKey: '' });
    expect(fs.existsSync(path.join(nested, 'config.json'))).toBe(true);
  });

  it('loadConfig reads back what saveConfig wrote', () => {
    const config = { provider: 'google-ai-studio' as const, heavyModel: 'gemini-2.5-flash', lightModel: 'gemini-2.5-flash', apiKey: 'AIzaRound' };
    saveConfig(tmpDir, config);
    const loaded = loadConfig(tmpDir);
    expect(loaded.provider).toBe('google-ai-studio');
    expect(loaded.heavyModel).toBe('gemini-2.5-flash');
    expect(loaded.apiKey).toBe('AIzaRound');
  });
});
