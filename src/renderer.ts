import type { ElectronAPI } from './shared/ipc';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const scrollback = document.getElementById('scrollback') as HTMLDivElement;
const input = document.getElementById('input') as HTMLInputElement;
const form = document.getElementById('input-form') as HTMLFormElement;

const history: string[] = [];
let historyIndex = -1;

function appendLines(lines: string[]): void {
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    scrollback.appendChild(p);
  }
  scrollback.scrollTop = scrollback.scrollHeight;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  history.unshift(text);
  historyIndex = -1;
  input.value = '';
  input.disabled = true;

  const response = await window.electronAPI.submitInput(text);
  appendLines(response.narrative);

  input.disabled = false;
  input.focus();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex < history.length - 1) {
      historyIndex++;
      input.value = history[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      input.value = history[historyIndex];
    } else {
      historyIndex = -1;
      input.value = '';
    }
  }
});
