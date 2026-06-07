import type { ElectronAPI, HudData, MapData } from './shared/ipc';

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
const ollamaFlavorMsg = document.getElementById('ollama-flavor-msg') as HTMLParagraphElement;
const ollamaSetupButtons = document.getElementById('ollama-setup-buttons') as HTMLDivElement;
const inputProvider = document.getElementById('input-provider') as HTMLSelectElement;
const apiKeyField = document.getElementById('api-key-field') as HTMLDivElement;
const inputApiKey = document.getElementById('input-api-key') as HTMLInputElement;
const inputHeavyModel = document.getElementById('input-heavy-model') as HTMLSelectElement;
const inputLightModel = document.getElementById('input-light-model') as HTMLSelectElement;
const modelConfigStatus = document.getElementById('model-config-status') as HTMLDivElement;

// Game view
const hudHp = document.getElementById('hud-hp') as HTMLSpanElement;
const hudWeapon = document.getElementById('hud-weapon') as HTMLSpanElement;
const hudArmor = document.getElementById('hud-armor') as HTMLSpanElement;
const hudRoom = document.getElementById('hud-room') as HTMLSpanElement;
const scrollback = document.getElementById('scrollback') as HTMLDivElement;
const input = document.getElementById('input') as HTMLInputElement;
const form = document.getElementById('input-form') as HTMLFormElement;
const backToPickerBtn = document.getElementById('back-to-picker') as HTMLButtonElement;
const openOraclesBtn = document.getElementById('open-oracles') as HTMLButtonElement;
const spinner = document.getElementById('spinner') as HTMLSpanElement;

// Map overlay
const mapOverlayEl = document.getElementById('map-overlay') as HTMLDivElement;
const mapRoomLabelEl = document.getElementById('map-room-label') as HTMLDivElement;
const mapGridEl = document.getElementById('map-grid') as HTMLPreElement;
const mapFloorLabelEl = document.getElementById('map-floor-label') as HTMLDivElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const history: string[] = [];
let historyIndex = -1;
let activeWorldFolder: string | null = null;

// Deferred game navigation — stored when the user picks a world while the
// setup screen hasn't run yet, or to re-enter game after setup succeeds.
let pendingGameNav: { roomDescription: string; roomName?: string; hud?: HudData } | null = null;
let returnToGameAfterSetup = false;

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
  if (hud.armor) {
    hudArmor.textContent = `${hud.armor.name} (${hud.armor.armor_value})`;
  } else {
    hudArmor.textContent = 'none';
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

const GOOGLE_MODELS = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemma-3-27b-it',
  'gemini-live-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

function populateSelect(select: HTMLSelectElement, models: string[], current: string): void {
  select.innerHTML = '';
  const options = models.includes(current) ? models : [current, ...models];
  for (const m of options) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  }
  select.value = current;
}

async function populateModelSelects(provider: string, heavyModel: string, lightModel: string): Promise<void> {
  if (provider === 'google-ai-studio') {
    populateSelect(inputHeavyModel, GOOGLE_MODELS, heavyModel);
    populateSelect(inputLightModel, GOOGLE_MODELS, lightModel);
  } else if (provider === 'openrouter') {
    const models = await window.electronAPI.listOpenRouterModels();
    populateSelect(inputHeavyModel, models, heavyModel);
    populateSelect(inputLightModel, models, lightModel);
  } else {
    const models = await window.electronAPI.listOllamaModels();
    populateSelect(inputHeavyModel, models, heavyModel);
    populateSelect(inputLightModel, models, lightModel);
  }
}

async function showSetup(): Promise<void> {
  worldPickerEl.style.display = 'none';
  ollamaSetupEl.style.display = 'flex';
  gameViewEl.style.display = 'none';

  // Populate model config inputs from the current config
  try {
    const config = await window.electronAPI.getConfig();
    inputProvider.value = config.provider;
    inputApiKey.value = config.apiKey;
    apiKeyField.style.display = config.provider !== 'ollama' ? 'flex' : 'none';
    await populateModelSelects(config.provider, config.heavyModel, config.lightModel);
    modelConfigStatus.textContent = '';
  } catch {
    // Non-fatal — inputs remain blank
  }
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

const GENERATE_FLAVORS = [
  'consulting the oracle...',
  'the narrator reaches for a quill...',
  'rolling for description...',
  'weaving the narrative...',
  'the storyteller ponders...',
  'divining the next passage...',
  'consulting ancient tomes...',
  'the oracle dreams...',
  'spinning the threads of fate...',
  'the narrator deliberates...',
  'communing with the beyond...',
  'inscribing the world...',
];

let generateFlavorIndex = 0;
let generateFlavorInterval: ReturnType<typeof setInterval> | null = null;

function startGenerateFlavors(): void {
  generateFlavorIndex = Math.floor(Math.random() * GENERATE_FLAVORS.length);
  spinner.textContent = GENERATE_FLAVORS[generateFlavorIndex];
  generateFlavorInterval = setInterval(() => {
    generateFlavorIndex = (generateFlavorIndex + 1) % GENERATE_FLAVORS.length;
    spinner.textContent = GENERATE_FLAVORS[generateFlavorIndex];
  }, 2500);
}

function stopGenerateFlavors(): void {
  if (generateFlavorInterval !== null) {
    clearInterval(generateFlavorInterval);
    generateFlavorInterval = null;
  }
  spinner.textContent = '';
}

const PULL_FLAVORS = [
  'Negotiating with the void...',
  'The weights are... substantial.',
  'Unpacking aeons of compressed thought...',
  'Teaching the narrator what a sword looks like...',
  'Almost definitely not sentient. Probably.',
  'Downloading opinions on narrative pacing...',
  'Sharpening the neurons...',
  'The oracle stirs in its digital lair...',
  'Feeding the mind its training rations...',
  'Convincing gigabytes to cooperate...',
  'Coaxing ancient knowledge into RAM...',
  'The mind dreams of probability distributions...',
];

let flavorInterval: ReturnType<typeof setInterval> | null = null;

function startFlavorCycle(): void {
  let i = 0;
  ollamaFlavorMsg.textContent = PULL_FLAVORS[i];
  flavorInterval = setInterval(() => {
    i = (i + 1) % PULL_FLAVORS.length;
    ollamaFlavorMsg.textContent = PULL_FLAVORS[i];
  }, 3500);
}

function stopFlavorCycle(): void {
  if (flavorInterval !== null) {
    clearInterval(flavorInterval);
    flavorInterval = null;
  }
  ollamaFlavorMsg.textContent = '';
}

async function runSetupCheck(): Promise<void> {
  showSetup();
  ollamaStatusMsg.textContent = 'Rousing the oracles...';
  ollamaProgressMsg.textContent = '';
  ollamaFlavorMsg.textContent = '';
  ollamaSetupButtons.innerHTML = '';

  const result = await window.electronAPI.checkOllama();

  if (result.ok) {
    ollamaStatusMsg.textContent = '✓ The oracles are awake.';
    ollamaProgressMsg.textContent = '';
    ollamaSetupButtons.innerHTML = '';
    // Brief pause so the user can see the success message
    await new Promise((r) => setTimeout(r, 800));
    if (pendingGameNav) {
      const nav = pendingGameNav;
      pendingGameNav = null;
      showGame(nav.roomDescription, nav.roomName, nav.hud);
    } else if (returnToGameAfterSetup) {
      returnToGameAfterSetup = false;
      worldPickerEl.style.display = 'none';
      ollamaSetupEl.style.display = 'none';
      gameViewEl.style.display = 'flex';
      input.focus();
    } else {
      showPicker();
    }
    return;
  }

  // Failure path
  if (result.phase === 'reachability') {
    ollamaStatusMsg.textContent =
      'The oracles do not answer. Nothing stirs at http://localhost:11434.\n\n' +
      'Install Ollama from https://ollama.com and wake it, then try again.';
    setSetupButtons(
      makeButton('Try Again', 'primary', () => runSetupCheck()),
    );
    return;
  }

  if (result.phase === 'models') {
    ollamaStatusMsg.textContent =
      `${result.error}\n\nThe minds are not yet formed. Summon them to continue.`;
    setSetupButtons(
      makeButton('Summon Models', 'primary', () => runPullModels()),
      makeButton('Try Again', '', () => runSetupCheck()),
    );
    return;
  }

  if (result.phase === 'smoke_test') {
    ollamaStatusMsg.textContent =
      `${result.error}\n\nThe mind woke but gave no answer. Try restarting Ollama and trying again.`;
    setSetupButtons(
      makeButton('Try Again', 'primary', () => runSetupCheck()),
    );
    return;
  }

  if (result.phase === 'auth') {
    ollamaStatusMsg.textContent =
      `${result.error}\n\nOpen "Chosen Minds" below and inscribe a valid API key.`;
    setSetupButtons(
      makeButton('Try Again', 'primary', () => runSetupCheck()),
    );
    return;
  }

  ollamaStatusMsg.textContent = result.error;
  setSetupButtons(
    makeButton('Try Again', 'primary', () => runSetupCheck()),
  );
}

async function runPullModels(): Promise<void> {
  ollamaStatusMsg.textContent = 'Summoning minds from the digital deep...\n(this may take a while)';
  ollamaProgressMsg.textContent = '';
  ollamaSetupButtons.innerHTML = '';
  startFlavorCycle();

  window.electronAPI.onPullProgress((status) => {
    ollamaProgressMsg.textContent = status;
  });

  const result = await window.electronAPI.pullModels();
  stopFlavorCycle();

  if (!result.ok) {
    ollamaStatusMsg.textContent = `The summoning failed: ${result.error}`;
    setSetupButtons(
      makeButton('Try Again', 'primary', () => runSetupCheck()),
    );
    return;
  }

  // Pull succeeded — re-run the full check
  runSetupCheck();
}

// ---------------------------------------------------------------------------
// Model config inputs — persist on blur and re-check Ollama
// ---------------------------------------------------------------------------

async function saveModelConfig(): Promise<void> {
  const provider = inputProvider.value as 'ollama' | 'google-ai-studio';
  const heavyModel = inputHeavyModel.value.trim();
  const lightModel = inputLightModel.value.trim();
  const apiKey = inputApiKey.value.trim();
  if (!heavyModel || !lightModel) return;

  modelConfigStatus.textContent = 'Binding the new minds...';
  const result = await window.electronAPI.setConfig({ provider, heavyModel, lightModel, apiKey });
  if (!result.ok) {
    modelConfigStatus.textContent = `Error: ${result.error}`;
    return;
  }
  modelConfigStatus.textContent = 'Saved.';
  setSetupButtons(
    makeButton('Re-verify', 'primary', () => runSetupCheck()),
  );
}

inputProvider.addEventListener('change', async () => {
  const provider = inputProvider.value;
  apiKeyField.style.display = provider !== 'ollama' ? 'flex' : 'none';
  const defaultModel = provider === 'google-ai-studio' ? 'gemini-2.5-flash' : '';
  await populateModelSelects(provider, defaultModel, defaultModel);
  saveModelConfig();
});

inputApiKey.addEventListener('blur', () => {
  if (inputApiKey.value.trim() !== inputApiKey.dataset.lastSaved) {
    inputApiKey.dataset.lastSaved = inputApiKey.value.trim();
    saveModelConfig();
  }
});

inputHeavyModel.addEventListener('change', () => saveModelConfig());
inputLightModel.addEventListener('change', () => saveModelConfig());

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

openOraclesBtn.addEventListener('click', async () => {
  returnToGameAfterSetup = true;
  await showSetup();
  ollamaStatusMsg.textContent = 'Adjust your oracles below, then re-verify.';
  setSetupButtons(
    makeButton('Re-verify', 'primary', () => runSetupCheck()),
    makeButton('Back to Game', '', () => {
      returnToGameAfterSetup = false;
      worldPickerEl.style.display = 'none';
      ollamaSetupEl.style.display = 'none';
      gameViewEl.style.display = 'flex';
      input.focus();
    }),
  );
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
  startGenerateFlavors();

  let response;
  try {
    response = await window.electronAPI.submitInput(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendLine(`(The oracle falls silent: ${msg})`, 'system-msg');
    stopGenerateFlavors();
    spinner.classList.remove('active');
    input.disabled = false;
    input.focus();
    return;
  }
  for (const line of response.narrative) {
    appendLine(line, classifyLine(line));
  }
  if (response.hud) updateHud(response.hud);

  stopGenerateFlavors();
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
// Map overlay
// ---------------------------------------------------------------------------

const MAP_WINDOW = 8;

function renderAsciiMap(mapData: MapData): string {
  const W = MAP_WINDOW;
  const SIZE = W * 2 + 1;

  const currentRoom = mapData.rooms.find((r) => r.id === mapData.current_room_id);
  if (!currentRoom) return '(no visited rooms)';

  const cx = currentRoom.x;
  const cz = currentRoom.z;

  const roomAt = new Map<string, { id: number }>();
  for (const r of mapData.rooms) {
    roomAt.set(`${r.x},${r.z}`, r);
  }

  const roomCoords = new Map<number, { x: number; z: number }>();
  for (const r of mapData.rooms) {
    roomCoords.set(r.id, { x: r.x, z: r.z });
  }

  const exitSet = new Set<string>();
  for (const e of mapData.exits) {
    const coords = roomCoords.get(e.from_room_id);
    if (coords) exitSet.add(`${coords.x},${coords.z},${e.direction}`);
  }

  const charCols = SIZE * 4 - 1;
  const charRows = SIZE * 2 - 1;
  const grid: string[][] = Array.from({ length: charRows }, () => Array(charCols).fill(' '));

  for (let gz = -W; gz <= W; gz++) {
    for (let gx = -W; gx <= W; gx++) {
      const worldX = cx + gx;
      const worldZ = cz + gz;
      const mapCol = gx + W;
      const mapRow = gz + W;
      const charCol = mapCol * 4;
      const charRow = mapRow * 2;

      const room = roomAt.get(`${worldX},${worldZ}`);
      if (!room) continue;

      const isCurrent = room.id === mapData.current_room_id;
      grid[charRow][charCol] = '[';
      grid[charRow][charCol + 1] = isCurrent ? '*' : ' ';
      grid[charRow][charCol + 2] = ']';

      if (mapCol < SIZE - 1) {
        const hasEast =
          exitSet.has(`${worldX},${worldZ},east`) ||
          exitSet.has(`${worldX + 1},${worldZ},west`);
        if (hasEast) grid[charRow][charCol + 3] = '-';
      }

      if (mapRow < SIZE - 1) {
        const hasSouth =
          exitSet.has(`${worldX},${worldZ},south`) ||
          exitSet.has(`${worldX},${worldZ + 1},north`);
        if (hasSouth) grid[charRow + 1][charCol + 1] = '|';
      }
    }
  }

  return grid.map((row) => row.join('')).join('\n');
}

let mapTabHeld = false;

document.addEventListener('keydown', async (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  if (mapTabHeld || gameViewEl.style.display === 'none') return;
  mapTabHeld = true;

  const mapData = await window.electronAPI.getMapData();
  if (!mapData) return;

  const currentRoom = mapData.rooms.find((r) => r.id === mapData.current_room_id);
  mapRoomLabelEl.textContent = currentRoom ? currentRoom.name : '';
  mapFloorLabelEl.textContent = `floor ${mapData.floor}`;
  mapGridEl.textContent = renderAsciiMap(mapData);
  mapOverlayEl.classList.add('visible');
});

document.addEventListener('keyup', (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  mapTabHeld = false;
  mapOverlayEl.classList.remove('visible');
});

// ---------------------------------------------------------------------------
// Boot — show world picker on load
// ---------------------------------------------------------------------------

showPicker();

