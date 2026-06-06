export interface SubmitInputArgs {
  text: string;
}

export interface SubmitInputResponse {
  narrative: string[];
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
}

export type CreateWorldResult =
  | CreateWorldResponse
  | { ok: false; error: string };

/** Sent when the user picks a world to continue. */
export interface ContinueWorldResponse {
  ok: true;
  title: string;
  currentRoomDescription: string;
}

export type ContinueWorldResult =
  | ContinueWorldResponse
  | { ok: false; error: string };

/** Generic ok/error result. */
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

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
}
