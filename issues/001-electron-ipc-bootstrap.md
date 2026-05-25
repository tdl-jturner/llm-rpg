# 001 — Electron + Typed IPC Bootstrap

## Parent PRD

`issues/prd.md`

## What to build

Scaffold the Electron application using Electron Forge with the Vite template, TypeScript strict mode on both processes. Establish the main/renderer/preload split with `contextBridge` and a typed IPC contract. Renderer is a single-window app showing a scrollback area and a single-line input box. Typing into the input and submitting sends the text to the main process via `submitInput(text)`; main responds asynchronously with `{ narrative: string[] }` containing the echoed input prefixed with `> `. Renderer appends the response to the scrollback.

No SQLite, no Ollama, no game logic. This slice proves the architectural skeleton and the IPC round-trip.

See PRD sections: Architecture, UI shell (renderer), Process architecture.

## Acceptance criteria

- [ ] App launches via `npm start` (or equivalent Forge command) and shows a window with scrollback + input box.
- [ ] Renderer has `nodeIntegration: false` and `contextIsolation: true`; preload exposes only the typed IPC surface via `contextBridge`.
- [ ] TypeScript strict mode on both main and renderer; shared IPC types live in a shared module imported by both sides.
- [ ] Typing `hello` and hitting Enter shows `> hello` in the scrollback.
- [ ] No direct Node module access from the renderer (verified by attempting `require` and confirming it fails).
- [ ] Production-quality packaging works (`npm run package` produces a runnable binary on the developer's OS).

## Blocked by

None — can start immediately.

## User stories addressed

- User story 48
