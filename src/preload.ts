import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronAPI,
  SubmitInputResponse,
  ListWorldsResponse,
  CreateWorldResult,
  ContinueWorldResult,
  ActionResult,
  OllamaCheckResult,
  AppConfig,
  MapData,
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

  openLogFolder: (folderName?: string): Promise<ActionResult> =>
    ipcRenderer.invoke('open-log-folder', folderName),

  checkOllama: (): Promise<OllamaCheckResult> =>
    ipcRenderer.invoke('check-ollama'),

  pullModels: (): Promise<ActionResult> =>
    ipcRenderer.invoke('pull-models'),

  listOllamaModels: (): Promise<string[]> =>
    ipcRenderer.invoke('list-ollama-models'),

  listOpenRouterModels: (): Promise<string[]> =>
    ipcRenderer.invoke('list-openrouter-models'),

  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke('get-config'),

  setConfig: (config: AppConfig): Promise<ActionResult> =>
    ipcRenderer.invoke('set-config', config),

  onPullProgress: (callback: (status: string) => void): void => {
    ipcRenderer.on('pull-progress', (_event, status: string) => callback(status));
  },

  getMapData: (): Promise<MapData | null> =>
    ipcRenderer.invoke('get-map-data'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
