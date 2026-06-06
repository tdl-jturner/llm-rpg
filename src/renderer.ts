import type { ElectronAPI, HudData } from './shared/ipc';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------

const worldPickerEl = document.getElementById('world-picker') as HTMLDivElement;
const ollamaSetupEl = document.getElementById('ollama-setup') as HTMLDivElement;
const gameViewEl = document.getElementById('game-view') as HTMLDivElement;

// World picker
const pickerError = document.getElementById('picker-error') as HTMLDivElement;
const noWorldsMsg = document.getElementById('no-worlds-msg') as HTMLParagraphElement;
const worldListEl = document.getElementById('world-list') as HTMLUListElement;
const btnCreateWorld = document.getElementById('btn-create-world') as HTMLButtonElement;

// Ollama setup
const ollamaStatusMsg = document.getElementById('ollama-status-msg') as HTMLParagraphElement;
const ollamaProgressMsg = document.getElementById('ollama-progress-msg') as HTMLParagraphElement;
const ollamaSetupButtons = document.getElementById('ollama-setup-buttons') as HTMLDivElement;

// Game view
const hudHp = document.getElementById('hud-hp') as HTMLSpanElement;
const hudWeapon = document.getElementById('hud-weapon') as HTMLSpanElement;
const hudRoom = document.getElementById('hud-room') as HTMLSpanElement;
const scrollback = document.getElementById('scrollback') as HTMLDivElement;
const input = document.getElementById('input') as HTMLInputElement;
const form = document.getElementById('input-form') as HTMLFormElement;
const backToPickerBtn = document.getElementById('back-to-picker') as HTMLButtonElement;
const spinner = document.getElementById('spinner') as HTMLSpanElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const history: string[] = [];
let historyIndex = -1;
let activeWorldFolder: string | null = null;

// Deferred game navigation — stored when the user picks a world while the
// setup screen hasn't run yet, or to re-enter game after setup succeeds.
let pendingGameNav: { roomDescription: string; roomName?: string; hud?: HudData } | null = null;

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function updateHud(hud: HudData): void {
  hudHp.textContent = `${hud.hp}/${hud.max_hp}`;
  if (hud.weapon) {
    hudWeapon.textContent = `${hud.weapon.name} (${hud.weapon.damage_min}–${hud.weapon.damage_max})`;
  } else {
    hudWeapon.textContent = 'fists (1–2)';
  }
  hudRoom.textContent = hud.room_name;
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

function showPicker(): void {
  worldPickerEl.style.display = 'flex';
  ollamaSetupEl.style.display = 'none';
  gameViewEl.style.display = 'none';
  pickerError.textContent = '';
  refreshWorldList();
}

function showSetup(): void {
  worldPickerEl.style.display = 'none';
  ollamaSetupEl.style.display = 'flex';
  gameViewEl.style.display = 'none';
}

function showGame(roomDescription: string, roomName?: string, hud?: HudData): void {
  worldPickerEl.style.display = 'none';
  ollamaSetupEl.style.display = 'none';
  gameViewEl.style.display = 'flex';
  scrollback.innerHTML = '';
  history.length = 0;
  historyIndex = -1;

  if (hud) {
    updateHud(hud);
  } else if (roomName) {
    hudRoom.textContent = roomName;
  }
  appendLine(roomDescription, 'narrative');
  input.focus();
}

// ---------------------------------------------------------------------------
// Ollama setup screen
// ---------------------------------------------------------------------------

function setSetupButtons(...buttons: HTMLButtonElement[]): void {
  ollamaSetupButtons.innerHTML = '';
  for (const btn of buttons) ollamaSetupButtons.appendChild(btn);
}

function makeButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = className;
  btn.addEventListener('click', onClick);
  return btn;
}

async function runSetupCheck(): Promise<void> {
  showSetup();
  ollamaStatusMsg.textContent = 'Checking Ollama...';
  ollamaProgressMsg.textContent = '';
  ollamaSetupButtons.innerHTML = '';

  const result = await window.electronAPI.checkOllama();

  if (result.ok) {
    ollamaStatusMsg.textContent = '✓ Models ready';
    ollamaProgressMsg.textContent = '';
    ollamaSetupButtons.innerHTML = '';
    // Brief pause so the user can see the success message
    await new Promise((r) => setTimeout(r, 800));
    if (pendingGameNav) {
      const nav = pendingGameNav;
      pendingGameNav = null;
      showGame(nav.roomDescription, nav.roomName, nav.hud);
    } else {
      showPicker();
    }
    return;
  }

  // Failure path
  if (result.phase === 'reachability') {
    ollamaStatusMsg.textContent =
      'Cannot reach Ollama at http://localhost:11434.\n\n' +
      'Install Ollama from https://ollama.com and start it, then click Retry.';
    setSetupButtons(
      makeButton('Retry', 'primary', () => runSetupCheck()),
    );
    return;
  }

  if (result.phase === 'models') {
    ollamaStatusMsg.textContent =
      `${result.error}\n\nClick "Install Models" to pull the missing models.`;
    setSetupButtons(
      makeButton('Install Models', 'primary', () => runPullModels()),
      makeButton('Retry', '', () => runSetupCheck()),
    );
    return;
  }

  ollamaStatusMsg.textContent = result.error;
  setSetupButtons(
    makeButton('Retry', 'primary', () => runSetupCheck()),
  );
}

async function runPullModels(): Promise<void> {
  ollamaStatusMsg.textContent = 'Pulling models... (this may take a while)';
  ollamaProgressMsg.textContent = '';
  ollamaSetupButtons.innerHTML = '';

  window.electronAPI.onPullProgress((status) => {
    ollamaProgressMsg.textContent = status;
  });

  const result = await window.electronAPI.pullModels();

  if (!result.ok) {
    ollamaStatusMsg.textContent = `Pull failed: ${result.error}`;
    setSetupButtons(
      makeButton('Retry', 'primary', () => runSetupCheck()),
    );
    return;
  }

  // Pull succeeded — re-run the full check
  runSetupCheck();
}

// ---------------------------------------------------------------------------
// World picker logic
// ---------------------------------------------------------------------------

async function refreshWorldList(): Promise<void> {
  pickerError.textContent = '';
  worldListEl.innerHTML = '';

  const { worlds } = await window.electronAPI.listWorlds();

  if (worlds.length === 0) {
    noWorldsMsg.style.display = 'block';
    return;
  }

  noWorldsMsg.style.display = 'none';
  for (const world of worlds) {
    const li = document.createElement('li');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'world-title';
    titleSpan.textContent = world.title;

    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Continue';
    continueBtn.className = 'primary';
    continueBtn.addEventListener('click', () => onContinueWorld(world.folderName));

    const startOverBtn = document.createElement('button');
    startOverBtn.textContent = 'Start Over';
    startOverBtn.addEventListener('click', () => onStartOver(world.folderName, world.title));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'danger';
    deleteBtn.addEventListener('click', () => onDelete(world.folderName, world.title));

    const openLogsBtn = document.createElement('button');
    openLogsBtn.textContent = 'Open Logs';
    openLogsBtn.addEventListener('click', () => window.electronAPI.openLogFolder(world.folderName));

    li.append(titleSpan, continueBtn, startOverBtn, deleteBtn, openLogsBtn);
    worldListEl.appendChild(li);
  }
}

async function onContinueWorld(folderName: string): Promise<void> {
  pickerError.textContent = '';
  const result = await window.electronAPI.continueWorld(folderName);
  if (!result.ok) {
    pickerError.textContent = result.error;
    return;
  }
  activeWorldFolder = folderName;
  pendingGameNav = { roomDescription: result.currentRoomDescription, roomName: result.title, hud: result.hud };
  runSetupCheck();
}

async function onStartOver(folderName: string, title: string): Promise<void> {
  const confirmed = confirm(`Start Over "${title}"?\n\nThis will erase all progress for this world. Your WORLD.md and logs are preserved.`);
  if (!confirmed) return;

  pickerError.textContent = '';
  const result = await window.electronAPI.startOverWorld(folderName);
  if (!result.ok) {
    pickerError.textContent = result.error;
    return;
  }
  // After start-over, just refresh the list — player can click Continue to enter
  refreshWorldList();
}

async function onDelete(folderName: string, title: string): Promise<void> {
  const confirmed = confirm(`Delete "${title}"?\n\nThis will permanently remove the world folder including all progress and logs.`);
  if (!confirmed) return;

  pickerError.textContent = '';
  const result = await window.electronAPI.deleteWorld(folderName);
  if (!result.ok) {
    pickerError.textContent = result.error;
    return;
  }
  refreshWorldList();
}

btnCreateWorld.addEventListener('click', async () => {
  pickerError.textContent = '';
  const result = await window.electronAPI.openWorldFilePicker();
  if (!result.ok) {
    if (result.error !== 'No file selected.') {
      pickerError.textContent = result.error;
    }
    return;
  }
  activeWorldFolder = result.folderName;
  pendingGameNav = { roomDescription: result.startingRoomDescription, roomName: result.title, hud: result.hud };
  runSetupCheck();
});

backToPickerBtn.addEventListener('click', () => {
  showPicker();
});

// Global "Open All Logs" button — wired up after DOM is ready
const openAllLogsBtn = document.createElement('button');
openAllLogsBtn.textContent = 'Open All Logs';
openAllLogsBtn.id = 'btn-open-all-logs';
openAllLogsBtn.addEventListener('click', () => window.electronAPI.openLogFolder());
btnCreateWorld.insertAdjacentElement('afterend', openAllLogsBtn);

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

function appendLine(text: string, role: 'player-input' | 'narrative' | 'system-msg' | 'damage' = 'narrative'): void {
  const p = document.createElement('p');
  p.textContent = text;
  p.className = role;
  scrollback.appendChild(p);
  scrollback.scrollTop = scrollback.scrollHeight;
}

/** Classify a narrative line returned from the engine into a display role. */
function classifyLine(line: string): 'player-input' | 'narrative' | 'system-msg' | 'damage' {
  if (line.startsWith('> ')) return 'player-input';

  // Damage / death events
  if (
    /\d+ damage/i.test(line) ||
    /collapses/i.test(line) ||
    /goes black/i.test(line) ||
    /wake at the threshold/i.test(line) ||
    /strikes back/i.test(line)
  ) {
    return 'damage';
  }

  // System messages
  if (
    /^\(.*\)$/.test(line) ||
    line.startsWith('You take the') ||
    line.startsWith('You drop the') ||
    line.startsWith('You are carrying') ||
    line.startsWith('You already have') ||
    line.includes('You wield it') ||
    line.startsWith('As you leave') ||
    line.startsWith('Which do you mean')
  ) {
    return 'system-msg';
  }

  return 'narrative';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  history.unshift(text);
  if (history.length > 100) history.length = 100;
  historyIndex = -1;
  input.value = '';
  input.disabled = true;
  spinner.classList.add('active');

  const response = await window.electronAPI.submitInput(text);
  for (const line of response.narrative) {
    appendLine(line, classifyLine(line));
  }
  if (response.hud) updateHud(response.hud);

  spinner.classList.remove('active');
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

// ---------------------------------------------------------------------------
// Boot — show world picker on load
// ---------------------------------------------------------------------------

showPicker();

