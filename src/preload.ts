import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronAPI,
  SubmitInputResponse,
  ListWorldsResponse,
  CreateWorldResult,
  ContinueWorldResult,
  ActionResult,
} from './shared/ipc';

const api: ElectronAPI = {
  submitInput: (text: string): Promise<SubmitInputResponse> =>
    ipcRenderer.invoke('submit-input', text),

  listWorlds: (): Promise<ListWorldsResponse> =>
    ipcRenderer.invoke('list-worlds'),

  openWorldFilePicker: (): Promise<CreateWorldResult> =>
    ipcRenderer.invoke('open-world-file-picker'),

  continueWorld: (folderName: string): Promise<ContinueWorldResult> =>
    ipcRenderer.invoke('continue-world', folderName),

  startOverWorld: (folderName: string): Promise<ActionResult> =>
    ipcRenderer.invoke('start-over-world', folderName),

  deleteWorld: (folderName: string): Promise<ActionResult> =>
    ipcRenderer.invoke('delete-world', folderName),
};

contextBridge.exposeInMainWorld('electronAPI', api);
