import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, SubmitInputResponse } from './shared/ipc';

const api: ElectronAPI = {
  submitInput: (text: string): Promise<SubmitInputResponse> =>
    ipcRenderer.invoke('submit-input', text),
};

contextBridge.exposeInMainWorld('electronAPI', api);
