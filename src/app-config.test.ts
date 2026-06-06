import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig } from './app-config';

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
    expect(config.heavyModel).toBe('qwen3:8b');
    expect(config.lightModel).toBe('gemma3:1b');

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    expect(written.heavyModel).toBe('qwen3:8b');
    expect(written.lightModel).toBe('gemma3:1b');
  });

  it('returns existing config when file is present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ heavyModel: 'custom-heavy:7b', lightModel: 'custom-light:1b' }),
      'utf-8',
    );
    const config = loadConfig(tmpDir);
    expect(config.heavyModel).toBe('custom-heavy:7b');
    expect(config.lightModel).toBe('custom-light:1b');
  });

  it('merges missing keys with defaults when partial config is on disk', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ heavyModel: 'partial-heavy:13b' }),
      'utf-8',
    );
    const config = loadConfig(tmpDir);
    expect(config.heavyModel).toBe('partial-heavy:13b');
    expect(config.lightModel).toBe('gemma3:1b'); // filled from defaults
  });

  it('recovers from corrupt JSON by returning defaults', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{ invalid json', 'utf-8');
    const config = loadConfig(tmpDir);
    expect(config.heavyModel).toBe('qwen3:8b');
    expect(config.lightModel).toBe('gemma3:1b');
  });

  it('writes back the merged config so the file stays up to date', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ heavyModel: 'old:7b' }),
      'utf-8',
    );
    loadConfig(tmpDir);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
    // lightModel should have been added
    expect(written.lightModel).toBe('gemma3:1b');
  });
});
