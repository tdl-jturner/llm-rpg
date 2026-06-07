// ---------------------------------------------------------------------------
// AppConfig
//
// Reads/writes app settings from <userData>/config.json.
// Ships defaults for heavy and light model tags; merges missing keys so
// existing configs survive future field additions.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

export interface AppConfig {
  provider: 'ollama' | 'google-ai-studio' | 'openrouter';
  heavyModel: string;
  lightModel: string;
  apiKey: string;
}

const DEFAULTS: AppConfig = {
  provider: 'ollama',
  heavyModel: 'qwen3.5:9b',
  lightModel: 'gemma4:e2b',
  apiKey: '',
};

/**
 * Load the app config from `<userDataPath>/config.json`.
 * Creates the file with defaults if it does not exist.
 * Merges default values for any missing keys.
 */
export function loadConfig(userDataPath: string): AppConfig {
  const configPath = path.join(userDataPath, 'config.json');

  let raw: Partial<AppConfig> & { googleApiKey?: string } = {};

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      raw = JSON.parse(content) as typeof raw;
    } catch {
      // Corrupt config — fall back to defaults and overwrite below
      raw = {};
    }
  }

  const merged: AppConfig = {
    provider: raw.provider ?? DEFAULTS.provider,
    heavyModel: raw.heavyModel ?? DEFAULTS.heavyModel,
    lightModel: raw.lightModel ?? DEFAULTS.lightModel,
    // Migrate: 'googleApiKey' was renamed to 'apiKey' — preserve existing keys
    apiKey: raw.apiKey ?? raw.googleApiKey ?? DEFAULTS.apiKey,
  };

  // Write back so the file always reflects the merged result
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {
    // Best effort — don't crash the app if we can't write
  }

  return merged;
}

/**
 * Save the given config to `<userDataPath>/config.json`.
 * Creates parent directories if they don't exist.
 */
export function saveConfig(userDataPath: string, config: AppConfig): void {
  const configPath = path.join(userDataPath, 'config.json');
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
