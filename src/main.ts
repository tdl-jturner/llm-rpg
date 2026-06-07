import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { handleSubmitInput, buildHudData, buildInitialRoomDescription, resetDisambiguationState } from './main-handler';
import { openWorldDB } from './world-db';
import type { WorldDB } from './world-db';
import { loadWorldFile } from './world-file-loader';
import { createRealLLM } from './room-generator';
import { EventLogger } from './event-logger';
import { getUnknownRefusalKeys } from './refusal-bank';
import { loadConfig, saveConfig } from './app-config';
import { isOllamaReachable, listPulledModels, pullModel, callModel } from './ollama-client';
import { runOllamaSetup } from './ollama-setup';
import type {
  ListWorldsResponse,
  WorldSummary,
  CreateWorldResult,
  ContinueWorldResult,
  ActionResult,
  OllamaCheckResult,
  AppConfig,
} from './shared/ipc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let worldDB: WorldDB | undefined;
let activeLogger: EventLogger | undefined;
let activeRefusals: Record<string, string> | undefined;
let activeWorldBody: string | undefined;
let appConfig: AppConfig = { heavyModel: 'qwen3:8b', lightModel: 'gemma3:1b' };

// Real LLM function — uses the heavy model via Ollama, logs each call.
// Re-created lazily when needed so it always picks up the current appConfig
// and activeLogger.
function getRealLLM() {
  return createRealLLM(
    appConfig.heavyModel,
    callModel,
    activeLogger ?? undefined,
  );
}

// Light LLM function — uses the light model via Ollama for fast NL intent parsing.
// Re-created lazily when needed so it always picks up the current appConfig
// and activeLogger.
function getLightLLM() {
  return createRealLLM(
    appConfig.lightModel,
    callModel,
    activeLogger ?? undefined,
  );
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

// ---------------------------------------------------------------------------
// World folder helpers
// ---------------------------------------------------------------------------

function worldsDir(): string {
  return path.join(app.getPath('userData'), 'worlds');
}

function worldFolderPath(folderName: string): string {
  return path.join(worldsDir(), folderName);
}

function logsDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

/**
 * Derive a safe folder name from a world title.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims edges.
 */
function sanitizeFolderName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'world';
}

/**
 * Make a folder name unique within worldsDir by appending -2, -3, … as needed.
 */
function uniqueFolderName(base: string): string {
  const dir = worldsDir();
  let candidate = base;
  let suffix = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  return candidate;
}

/**
 * Read the title from a world folder's WORLD.md, or fall back to the folder name.
 */
function readWorldTitle(folderName: string): string {
  try {
    const mdPath = path.join(worldFolderPath(folderName), 'WORLD.md');
    const content = fs.readFileSync(mdPath, 'utf-8');
    const result = loadWorldFile(content);
    if (result.ok) return result.world.title;
  } catch {
    // ignore — fall back below
  }
  return folderName;
}

/**
 * Open a new EventLogger for the given world folder.
 * Closes the previous logger if open.
 */
function openLogger(folderName: string, worldMdPath?: string): EventLogger {
  activeLogger?.logSessionEnd();
  activeLogger?.close();
  activeLogger = new EventLogger(logsDir(), folderName);
  activeLogger.logSessionStart({
    worldName: folderName,
    worldMdPath: worldMdPath ?? '',
    engineVersion: app.getVersion(),
  });
  return activeLogger;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // ── Game input ────────────────────────────────────────────────────────────
  ipcMain.handle('submit-input', (_event, text: string) => {
    return handleSubmitInput(text, worldDB, getRealLLM(), activeLogger, activeWorldBody, activeRefusals, getLightLLM());
  });

  // ── World picker: list ────────────────────────────────────────────────────
  ipcMain.handle('list-worlds', (): ListWorldsResponse => {
    const dir = worldsDir();
    if (!fs.existsSync(dir)) return { worlds: [] };

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const worlds: WorldSummary[] = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        folderName: e.name,
        title: readWorldTitle(e.name),
      }));

    return { worlds };
  });

  // ── World picker: create new world from WORLD.md ──────────────────────────
  ipcMain.handle('open-world-file-picker', async (): Promise<CreateWorldResult> => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select WORLD.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'No file selected.' };
    }

    const filePath = result.filePaths[0];
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      return { ok: false, error: `Could not read file: ${e instanceof Error ? e.message : e}` };
    }

    const parsed = loadWorldFile(content);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const world = parsed.world;
    const baseFolder = sanitizeFolderName(world.title);
    const folderName = uniqueFolderName(baseFolder);
    const worldDir = worldFolderPath(folderName);

    try {
      fs.mkdirSync(worldDir, { recursive: true });
      fs.copyFileSync(filePath, path.join(worldDir, 'WORLD.md'));
    } catch (e) {
      return { ok: false, error: `Could not create world folder: ${e instanceof Error ? e.message : e}` };
    }

    try {
      worldDB?.db.close();
      resetDisambiguationState();
      worldDB = openWorldDB(worldDir, world);
      activeRefusals = world.refusals;
      activeWorldBody = world.body;
      const logger = openLogger(folderName, path.join(worldDir, 'WORLD.md'));
      // Warn about unknown refusal keys
      if (world.refusals) {
        for (const key of getUnknownRefusalKeys(world.refusals)) {
          logger.logError({ message: `Unknown refusal key in WORLD.md: "${key}" (ignored)` });
        }
      }
    } catch (e) {
      return { ok: false, error: `Could not open world database: ${e instanceof Error ? e.message : e}` };
    }

    return {
      ok: true,
      folderName,
      title: world.title,
      startingRoomDescription: buildInitialRoomDescription(worldDB),
      hud: buildHudData(worldDB),
    };
  });

  // ── World picker: continue ────────────────────────────────────────────────
  ipcMain.handle('continue-world', async (_event, folderName: string): Promise<ContinueWorldResult> => {
    const worldDir = worldFolderPath(folderName);
    const mdPath = path.join(worldDir, 'WORLD.md');

    let content: string;
    try {
      content = fs.readFileSync(mdPath, 'utf-8');
    } catch (e) {
      return { ok: false, error: `Could not read WORLD.md: ${e instanceof Error ? e.message : e}` };
    }

    const parsed = loadWorldFile(content);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    try {
      worldDB?.db.close();
      resetDisambiguationState();
      worldDB = openWorldDB(worldDir, parsed.world);
      activeRefusals = parsed.world.refusals;
      activeWorldBody = parsed.world.body;
      const logger = openLogger(folderName, mdPath);
      // Warn about unknown refusal keys
      if (parsed.world.refusals) {
        for (const key of getUnknownRefusalKeys(parsed.world.refusals)) {
          logger.logError({ message: `Unknown refusal key in WORLD.md: "${key}" (ignored)` });
        }
      }
    } catch (e) {
      return { ok: false, error: `Could not open world database: ${e instanceof Error ? e.message : e}` };
    }

    return {
      ok: true,
      title: parsed.world.title,
      currentRoomDescription: buildInitialRoomDescription(worldDB),
      hud: buildHudData(worldDB),
    };
  });

  // ── World picker: start over ──────────────────────────────────────────────
  ipcMain.handle('start-over-world', async (_event, folderName: string): Promise<ActionResult> => {
    const worldDir = worldFolderPath(folderName);
    const dbPath = path.join(worldDir, 'world.sqlite');
    const mdPath = path.join(worldDir, 'WORLD.md');

    // Close existing DB and logger if it's for this world
    worldDB?.db.close();
    worldDB = undefined;
    activeLogger?.close();
    activeLogger = undefined;
    activeWorldBody = undefined;
    activeRefusals = undefined;
    resetDisambiguationState();

    // Delete the SQLite database; preserve WORLD.md and logs/
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      // Also delete WAL and SHM files if present
      for (const suffix of ['-wal', '-shm']) {
        const extra = dbPath + suffix;
        if (fs.existsSync(extra)) fs.unlinkSync(extra);
      }
    } catch (e) {
      return { ok: false, error: `Could not delete world database: ${e instanceof Error ? e.message : e}` };
    }

    // Re-seed from WORLD.md
    let content: string;
    try {
      content = fs.readFileSync(mdPath, 'utf-8');
    } catch (e) {
      return { ok: false, error: `Could not read WORLD.md: ${e instanceof Error ? e.message : e}` };
    }

    const parsed = loadWorldFile(content);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    try {
      worldDB = openWorldDB(worldDir, parsed.world);
      activeWorldBody = parsed.world.body;
      activeRefusals = parsed.world.refusals;
      openLogger(folderName, mdPath);
    } catch (e) {
      return { ok: false, error: `Could not re-create world database: ${e instanceof Error ? e.message : e}` };
    }

    return { ok: true };
  });

  // ── World picker: delete ──────────────────────────────────────────────────
  ipcMain.handle('delete-world', async (_event, folderName: string): Promise<ActionResult> => {
    const worldDir = worldFolderPath(folderName);

    worldDB?.db.close();
    worldDB = undefined;
    activeLogger?.close();
    activeLogger = undefined;
    activeWorldBody = undefined;
    resetDisambiguationState();

    try {
      fs.rmSync(worldDir, { recursive: true, force: true });
    } catch (e) {
      return { ok: false, error: `Could not delete world folder: ${e instanceof Error ? e.message : e}` };
    }

    return { ok: true };
  });

  // ── Ollama: get config ────────────────────────────────────────────────────
  ipcMain.handle('get-config', (): AppConfig => {
    return appConfig;
  });

  // ── Ollama: set config ────────────────────────────────────────────────────
  ipcMain.handle('set-config', (_event, newConfig: AppConfig): ActionResult => {
    try {
      saveConfig(app.getPath('userData'), newConfig);
      appConfig = newConfig;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Could not save config: ${e instanceof Error ? e.message : e}` };
    }
  });

  // ── Ollama: check reachability + models ──────────────────────────────────
  ipcMain.handle('check-ollama', async (): Promise<OllamaCheckResult> => {
    return runOllamaSetup(appConfig, {
      isReachable: isOllamaReachable,
      listModels: listPulledModels,
      callModel: async (tag, prompt, jsonMode) => {
        const response = await callModel(tag, prompt, jsonMode);
        activeLogger?.logLlmCall({ model: tag, prompt, response, ok: true });
        return response;
      },
    });
  });

  // ── Ollama: pull missing models ───────────────────────────────────────────
  ipcMain.handle('pull-models', async (event): Promise<ActionResult> => {
    let pulledModels: string[];
    try {
      pulledModels = await listPulledModels();
    } catch (e) {
      return { ok: false, error: `Could not list models: ${e instanceof Error ? e.message : e}` };
    }

    const required = [appConfig.heavyModel, appConfig.lightModel];
    const missing = required.filter((tag) => !pulledModels.includes(tag));

    for (const tag of missing) {
      try {
        await pullModel(tag, (status) => {
          event.sender.send('pull-progress', `[${tag}] ${status}`);
        });
      } catch (e) {
        return {
          ok: false,
          error: `Failed to pull "${tag}": ${e instanceof Error ? e.message : e}`,
        };
      }
    }

    return { ok: true };
  });

  // ── Open Log Folder ───────────────────────────────────────────────────────
  ipcMain.handle('open-log-folder', async (_event, folderName?: string): Promise<ActionResult> => {
    const dir = folderName ? path.join(logsDir(), folderName) : logsDir();
    fs.mkdirSync(dir, { recursive: true }); // ensure it exists
    const result = await shell.openPath(dir);
    return result === '' ? { ok: true } : { ok: false, error: result };
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  appConfig = loadConfig(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  worldDB?.db.close();
  activeLogger?.logSessionEnd();
  activeLogger?.close();
  if (process.platform !== 'darwin') app.quit();
});
