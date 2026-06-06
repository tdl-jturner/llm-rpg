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
  heavyModel: string;
  lightModel: string;
}

const DEFAULTS: AppConfig = {
  heavyModel: 'qwen3.5:9b',
  lightModel: 'gemma4:e2b',
};

/**
 * Load the app config from `<userDataPath>/config.json`.
 * Creates the file with defaults if it does not exist.
 * Merges default values for any missing keys.
 */
export function loadConfig(userDataPath: string): AppConfig {
  const configPath = path.join(userDataPath, 'config.json');

  let raw: Partial<AppConfig> = {};

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      raw = JSON.parse(content) as Partial<AppConfig>;
    } catch {
      // Corrupt config — fall back to defaults and overwrite below
      raw = {};
    }
  }

  const merged: AppConfig = {
    heavyModel: raw.heavyModel ?? DEFAULTS.heavyModel,
    lightModel: raw.lightModel ?? DEFAULTS.lightModel,
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
