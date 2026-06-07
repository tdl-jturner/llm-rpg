export interface SubmitInputArgs {
  text: string;
}

export interface HudData {
  hp: number;
  max_hp: number;
  weapon: { name: string; damage_min: number; damage_max: number } | null;
  room_name: string;
}

export interface SubmitInputResponse {
  narrative: string[];
  hud?: HudData;
}

// ---------------------------------------------------------------------------
// World picker types
// ---------------------------------------------------------------------------

/** Summary of a world on disk, shown in the world picker list. */
export interface WorldSummary {
  /** Sanitized folder name under userData/worlds/. */
  folderName: string;
  /** Title parsed from WORLD.md frontmatter. */
  title: string;
}

export interface ListWorldsResponse {
  worlds: WorldSummary[];
}

/** Sent when the user wants to create a new world from a WORLD.md file. */
export interface CreateWorldResponse {
  ok: true;
  folderName: string;
  title: string;
  startingRoomDescription: string;
  hud?: HudData;
}

export type CreateWorldResult =
  | CreateWorldResponse
  | { ok: false; error: string };

/** Sent when the user picks a world to continue. */
export interface ContinueWorldResponse {
  ok: true;
  title: string;
  currentRoomDescription: string;
  hud?: HudData;
}

export type ContinueWorldResult =
  | ContinueWorldResponse
  | { ok: false; error: string };

/** Generic ok/error result. */
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Ollama setup IPC types
// ---------------------------------------------------------------------------

export interface AppConfig {
  heavyModel: string;
  lightModel: string;
}

/**
 * Result of the `check-ollama` IPC call.
 * On success: { ok: true }
 * On failure: { ok: false; error: string; phase: ... }
 */
export type OllamaCheckResult =
  | { ok: true }
  | { ok: false; error: string; phase: 'reachability' | 'models' | 'smoke_test' };

// ---------------------------------------------------------------------------
// Electron API exposed via contextBridge
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  submitInput: (text: string) => Promise<SubmitInputResponse>;

  // World picker
  listWorlds: () => Promise<ListWorldsResponse>;
  openWorldFilePicker: () => Promise<CreateWorldResult>;
  continueWorld: (folderName: string) => Promise<ContinueWorldResult>;
  startOverWorld: (folderName: string) => Promise<ActionResult>;
  deleteWorld: (folderName: string) => Promise<ActionResult>;

  // Logs
  openLogFolder: (folderName?: string) => Promise<ActionResult>;

  // Ollama setup
  checkOllama: () => Promise<OllamaCheckResult>;
  pullModels: () => Promise<ActionResult>;
  getConfig: () => Promise<AppConfig>;
  setConfig: (config: AppConfig) => Promise<ActionResult>;
  onPullProgress: (callback: (status: string) => void) => void;
}
