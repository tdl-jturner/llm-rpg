# 015 — Emit state.mutate Log Events for All State Changes

## Parent PRD

`issues/prd.md`

## What is missing

The `EventLogger.logStateMutate()` method was implemented in issue 012 but is never called anywhere in the codebase. The PRD requires a `state.mutate` event for every change to room, item, monster, or player state.

Current state: zero `state.mutate` events are ever written to the session log.

## What the PRD requires

From the PRD Logging section and issue 012 acceptance criteria:

> Every state change (HP change, location change, equipped change, monster engagement, monster death, item movement, room insertion, exit insertion) produces a `state.mutate` event with before/after snapshots.

Event type: `state.mutate` with fields `entity`, `id`, `before`, `after`, `reason`.

## What to implement

`state.mutate` events must be emitted at every mutation point. The `EventLogger` is already plumbed through to `handleSubmitInput` as the `logger` parameter, and the `WorldDB` interface is also available. The changes fall into two categories:

**In `world-db.ts`** — the logger must be threaded into the `WorldDB` implementation (currently it is only used by `movePlayer`). Mutations to log:

- `takeItem`: item location change (`room:<id>` → `player_inventory`), `disturbed` flip, and `equipped_weapon_id` update if auto-equip fires.
- `dropItem`: item location change (`player_inventory` → `room:<id>`), `equipped_weapon_id` update if re-selection fires.
- `attackMonster`: monster HP change, player HP change, monster location change on death (→ `dead:<id>`), drop item location change on death (`monster:<id>` → `room:<id>`), `engaged` flag set.
- `applyPartingHits`: player HP change.
- `respawnPlayer`: player HP reset, player `current_room_id` reset, all engaged monsters' HP reset.
- Inside `movePlayer` — room insertion, exit insertions, player `current_room_id` update.

**In `main-handler.ts`** — thread `logger` into `worldDB` calls that currently don't receive it, or emit events inline after DB calls.

## Design note

The cleanest approach is to pass `logger` into the `WorldDB` closure at construction time (stored as a `let activeLogger` that can be updated, since `openWorldDB` returns a closure already capturing `worldBody`). An alternative is to have all DB-mutating WorldDB methods accept an optional `logger` parameter — this matches the existing `movePlayer` signature.

## Acceptance criteria

- [ ] `TAKE` produces `state.mutate` events for item location, disturbed flag, and equipped weapon changes (with correct `before`/`after` snapshots).
- [ ] `DROP` produces `state.mutate` events for item location and equipped weapon changes.
- [ ] `ATTACK` produces `state.mutate` events for player HP, monster HP, monster engaged flag. On monster death: additional events for monster location and drop item location.
- [ ] Parting hits produce a `state.mutate` event for player HP.
- [ ] Respawn produces `state.mutate` events for player HP, player room, and each refilled monster's HP.
- [ ] Room generation produces `state.mutate` events for new room insertion, new exit insertions, and player room update.
- [ ] Loop-closure produces `state.mutate` events for the retro-added exits and player room update.
- [ ] Session log inspected manually shows well-formed `state.mutate` records with non-null `before` and `after` fields.

## PRD user stories addressed

- User story 46 (session-scoped JSONL event log)
