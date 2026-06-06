# 016 — Seed Starting-Room Items and Monsters from WORLD.md Frontmatter

## Parent PRD

`issues/prd.md`

## What is missing

The `seedIfEmpty()` function in `src/world-db.ts` handles `starting_room.scenery` from the WORLD.md frontmatter but silently drops `starting_room.items` and `starting_room.monsters`. The `WorldFileLoader` fully validates and parses both fields, and the `StartingRoom` interface declares them as optional arrays, but the seed step never reads them.

This means a world author who writes a starting room with authored weapons or monsters (per the WORLD.md format specified in the PRD) will see those entities missing on first load — with no error.

## PRD requirement

From the PRD, World and Save Model section:

> Frontmatter holds structured data: `title`, the full `starting_room` (with `name`, `fixed_description`, `exits`, optional `items`, `monsters`, `scenery`).

And from the Implementation Decisions:

> The starting room is inserted at coordinates `(0,0,0)` on new game.

The implication is that all frontmatter-authored entities (items, monsters, scenery) are persisted at seed time.

## What to fix

In `src/world-db.ts`, the `seedIfEmpty()` function:

1. After inserting scenery, add a block that inserts each item in `sr.items` (if any) using the same `INSERT INTO items ...` statement used in `commitTx` inside `movePlayer`, with `location = "room:<roomId>"`, `disturbed = 0`.
2. Add a block that inserts each monster in `sr.monsters` (if any) using the same pattern as the monster insert in `commitTx`, with `location = "room:<roomId>"`, `engaged = 0`, and insert each monster's drop if it has one. Note: the `StartingRoomMonster` type does not currently include a `drop` field — it may be correct to omit drops for hand-authored starting monsters, or to add an optional `drop` field to the type. Decision: add optional `drop` field consistent with `GeneratedMonsterDrop`.

## Acceptance criteria

- [ ] A `WORLD.md` with `starting_room.items` shows those items in the first `LOOK` output when a new world is created.
- [ ] `TAKE` works on starting-room items correctly (disturbed flip, auto-equip).
- [ ] A `WORLD.md` with `starting_room.monsters` shows those monsters in the first `LOOK` output.
- [ ] `ATTACK` works against starting-room monsters.
- [ ] A `WORLD.md` without `items` or `monsters` in the starting room is unaffected (no regression).
- [ ] Existing scenery seeding is not broken.
- [ ] Unit test for `seedIfEmpty` (or an integration test via `openWorldDB`) verifies items and monsters appear.

## Implementation notes

The `StartingRoomMonster` interface in `world-file-loader.ts` may need a `drop?: StartingRoomItem` field (or the seeding can simply omit drop for starting monsters since they are hand-authored and the world author controls the starting experience).

## PRD user stories addressed

- User story 3 (first world loads with hand-authored starting room)
- User story 39 (world author controls starting room fully)
