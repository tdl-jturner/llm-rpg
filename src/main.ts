import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { handleSubmitInput } from './main-handler';
import { openWorldDB } from './world-db';
import type { WorldDB } from './world-db';
import { loadWorldFile } from './world-file-loader';
import { createStubLLM } from './room-generator';
import { EventLogger } from './event-logger';
import type {
  ListWorldsResponse,
  WorldSummary,
  CreateWorldResult,
  ContinueWorldResult,
  ActionResult,
} from './shared/ipc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let worldDB: WorldDB | undefined;
let activeLogger: EventLogger | undefined;

// Deterministic stub LLM — will be replaced with real Ollama in issue 006
const stubLLM = createStubLLM({ delayMs: 500 });

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
function openLogger(folderName: string): EventLogger {
  activeLogger?.close();
  activeLogger = new EventLogger(logsDir(), folderName);
  return activeLogger;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // ── Game input ────────────────────────────────────────────────────────────
  ipcMain.handle('submit-input', (_event, text: string) => {
    return handleSubmitInput(text, worldDB, stubLLM, activeLogger);
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
      worldDB = openWorldDB(worldDir, world);
      openLogger(folderName);
    } catch (e) {
      return { ok: false, error: `Could not open world database: ${e instanceof Error ? e.message : e}` };
    }

    return {
      ok: true,
      folderName,
      title: world.title,
      startingRoomDescription: worldDB.getCurrentRoom().fixed_description,
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
      worldDB = openWorldDB(worldDir, parsed.world);
      openLogger(folderName);
    } catch (e) {
      return { ok: false, error: `Could not open world database: ${e instanceof Error ? e.message : e}` };
    }

    return {
      ok: true,
      title: parsed.world.title,
      currentRoomDescription: worldDB.getCurrentRoom().fixed_description,
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

    try {
      fs.rmSync(worldDir, { recursive: true, force: true });
    } catch (e) {
      return { ok: false, error: `Could not delete world folder: ${e instanceof Error ? e.message : e}` };
    }

    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  worldDB?.db.close();
  activeLogger?.close();
  if (process.platform !== 'darwin') app.quit();
});
