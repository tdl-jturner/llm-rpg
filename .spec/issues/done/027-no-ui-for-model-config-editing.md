# 027 — No UI for Editing Configured Model Tags

## Parent PRD

`issues/prd.md`

## What is missing

The PRD specifies:

> Both model tags live in app configuration and **can be edited by the user**. Defaults to be chosen and confirmed at implementation time.

The `getConfig` IPC call is fully wired:
- `src/shared/ipc.ts` defines `getConfig: () => Promise<AppConfig>` in `ElectronAPI`.
- `src/preload.ts` exposes it via `contextBridge`.
- `src/main.ts` handles `get-config` and returns `appConfig`.
- `src/app-config.ts` reads/writes `config.json` in `userData`.

However, **the renderer never calls `getConfig` and there is no UI element** to display or change the model tags. The Ollama setup screen shows which models are required (via the error message) but offers no way for the user to change them without editing `config.json` on disk manually.

There is also no IPC handler for **writing** config changes — only `get-config` (read). A `set-config` IPC call would be needed to persist user edits.

## What to implement

### Minimum viable approach (strongly recommended for v1)

Add a small "Settings" area to the Ollama setup screen (since that is where model awareness lives) that shows the current heavy and light model tags and allows the user to edit them inline.

1. **IPC — add `set-config`:**
   - In `src/shared/ipc.ts`, add `setConfig: (config: AppConfig) => Promise<ActionResult>` to `ElectronAPI`.
   - In `src/preload.ts`, expose it.
   - In `src/main.ts`, handle `set-config`: call `saveConfig(app.getPath('userData'), newConfig)` and update `appConfig`.
   - In `src/app-config.ts`, add `saveConfig(userDataPath, config)` that writes `config.json`.

2. **UI — display and edit model tags:**
   - In `index.html`, add two labeled text inputs (heavy model, light model) to the Ollama setup section (or as a collapsible settings panel on the world picker).
   - In `src/renderer.ts`, after `checkOllama` completes (or when entering the setup screen), call `getConfig()` to populate the inputs.
   - On blur / change, call `setConfig()` to persist.
   - Re-run `checkOllama` after a model tag change so the user immediately sees whether the new tags are available.

## Acceptance criteria

- [ ] The Ollama setup screen (or world picker settings area) shows the current `heavyModel` and `lightModel` values in editable text inputs.
- [ ] Editing a model tag and submitting persists the change to `config.json`.
- [ ] After saving, `checkOllama` re-runs automatically to validate the new tags.
- [ ] The `getConfig` IPC is called on setup-screen entry to pre-populate the inputs (not hardcoded).
- [ ] A `setConfig` IPC handler is implemented and tested.

## PRD user stories addressed

- User story 43 (configurable Ollama heavy model and light model)
- User story 44 (detect Ollama running and configured models pulled, offer remediation)
