# 012 — WORLD.md Refusal Overrides + Complete Session Logging + Open Log Folder

## Parent PRD

`issues/prd.md`

## What to build

Two related observability + authoring features.

**Refusal overrides:** Extend the WorldFileLoader's frontmatter schema to recognize an optional `refusals:` map (key → override string). Extend the RefusalBank to consult this map before falling back to the hardcoded English default. Supported keys (each optional):

- `no_exit`
- `nothing_to_take`
- `nothing_here_named`
- `nothing_to_attack`
- `inventory_empty`
- `cannot_take_scenery`
- `cant_drop_what_you_dont_have`
- `intent_unparseable`
- `generation_failed`
- `chained_command_rejected`
- `already_have`

Unknown keys in the `refusals:` map are tolerated (logged as a warning at world-load) but ignored. Override values are plain strings; no templating in v1.

**Complete session logging:** Extend the EventLogger to capture all event types listed in the PRD:

- `session.start` (with world name, WORLD.md path, engine version)
- `session.end` (on clean shutdown; best-effort)
- `input.raw` (every input from the player, before parsing)
- `input.parsed` (the resolved Intent + path marker: `deterministic` | `llm`)
- `state.mutate` (every change to room/item/monster/player_state — entity type, id, before, after, reason)
- `refusal` (key, final message shown, whether it was overridden)
- `gen.room` / `gen.monster` / `gen.item` (already partially logged; ensure full coverage)
- `llm.call` (already logged)
- `error` (any caught exception or terminal-failure fallback)

Logs continue to be written one JSONL file per session under `userData/logs/<world-folder>/<ISO-timestamp>.jsonl`.

**Open Log Folder UI:** Add a small "Open Log Folder" button to the world picker (one button per world, opens that world's logs subdirectory; plus a global one for the root `logs/` folder). Uses Electron's `shell.openPath` to launch the OS file manager.

See PRD sections: Refusal voice, Logging.

## Acceptance criteria

- [ ] A WORLD.md with a `refusals:` block overrides the matching default messages in-game (verified by triggering each override key).
- [ ] A WORLD.md without `refusals:` still uses the hardcoded defaults (no regression).
- [ ] Unknown refusal keys in WORLD.md generate a warning in the session log at world-load and do not crash.
- [ ] Every player input produces an `input.raw` and an `input.parsed` event.
- [ ] Every state change (HP change, location change, equipped change, monster engagement, monster death, item movement, room insertion, exit insertion) produces a `state.mutate` event with before/after snapshots.
- [ ] Every refusal produces a `refusal` event capturing the key, the final message shown, and whether it was overridden by WORLD.md.
- [ ] Session start/end events bookend the file; clean shutdown writes `session.end`; force-quit acceptably leaves it absent.
- [ ] "Open Log Folder" button on the world picker opens the correct directory on macOS, Windows, and Linux.
- [ ] Unit tests for RefusalBank with WORLD.md overrides covering: full override map, partial override map, empty/missing map, unknown keys.

## Blocked by

- Blocked by `issues/011-nl-intent-parser.md`

## User stories addressed

- User story 35
- User story 37
- User story 41
- User story 46
