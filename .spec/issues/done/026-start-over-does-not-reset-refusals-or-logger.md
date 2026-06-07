# 026 — start-over-world Does Not Reset activeRefusals or Re-open Logger

## Parent PRD

`issues/prd.md`

## What is broken

In `src/main.ts`, the `start-over-world` IPC handler (lines 270–315):

1. Closes the existing `worldDB` and sets it to `undefined`.
2. Closes the existing `activeLogger` and sets it to `undefined`.
3. Sets `activeWorldBody = undefined`.
4. Deletes the SQLite file.
5. Reads `WORLD.md` and re-seeds a fresh DB, setting `activeWorldBody = parsed.world.body`.

**Two things are missing:**

**A. `activeRefusals` is not reset.**

```ts
// start-over-world handler — activeRefusals is never touched
worldDB?.db.close();
worldDB = undefined;
activeLogger?.close();
activeLogger = undefined;
activeWorldBody = undefined;
// activeRefusals ← never cleared or re-set
```

After start-over, `activeRefusals` still holds the overrides from the *previous* session. This means the new game begins with stale refusal overrides. If the fresh re-seed somehow fails before re-setting refusals (which the current code never does), the world runs with the wrong voice permanently. Even in the success path, the re-seed block (`openWorldDB`) sets `activeWorldBody` but not `activeRefusals` from `parsed.world.refusals`.

**B. No new logger is opened after start-over.**

The handler closes the logger and sets it to `undefined`, then re-seeds the world — but never calls `openLogger()`. After a start-over, the player can immediately click Continue (which does open a new logger), but if they trigger any `submit-input` before that (e.g., the renderer auto-issues a `look`), the logger is `undefined` and all events for those turns are silently lost.

The PRD says:
> A "session" is the lifetime of a loaded world within an app process.

A start-over followed by in-game play is a new session and must have a log file.

## What to fix

In the `start-over-world` handler in `src/main.ts`:

1. After re-seeding: add `activeRefusals = parsed.world.refusals;`
2. After re-seeding: call `openLogger(folderName, mdPath)` to start a fresh session log.
3. Also clear `activeRefusals = undefined` in the early-exit path (before the WORLD.md re-read), so no stale state leaks if re-seeding fails.

## Acceptance criteria

- [ ] After `start-over`, `activeRefusals` is populated from the fresh parse of `WORLD.md`.
- [ ] After `start-over`, a new JSONL session log is created (the log folder contains a new file with a later timestamp).
- [ ] If `WORLD.md` fails to parse during start-over, `activeRefusals` is `undefined` (not stale).
- [ ] `start-over` followed immediately by gameplay (without navigating back to picker and re-continuing) logs all events correctly.

## PRD user stories addressed

- User story 33 (start over resets the world cleanly)
- User story 41 (WORLD.md refusal overrides fit the world's voice)
- User story 46 (session-scoped JSONL event log)
