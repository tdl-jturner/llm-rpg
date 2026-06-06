import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { handleSubmitInput } from './main-handler';
import { openWorldDB } from './world-db';
import type { WorldDB } from './world-db';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let worldDB: WorldDB | undefined;

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

app.whenReady().then(() => {
  worldDB = openWorldDB(app.getPath('userData'));

  ipcMain.handle('submit-input', (_event, text: string) => {
    return handleSubmitInput(text, worldDB);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  worldDB?.db.close();
  if (process.platform !== 'darwin') app.quit();
});
