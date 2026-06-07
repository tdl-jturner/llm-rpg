# 022 — World Load Shows Raw fixed_description Instead of Full Assembled Room Blurb

## Parent PRD

`issues/prd.md`

## What is broken

When a player creates a new world or continues an existing one, the first text displayed in the game view is set from:

```ts
// src/main.ts, line 223 (create) and 264 (continue)
startingRoomDescription: worldDB.getCurrentRoom().fixed_description,
currentRoomDescription: worldDB.getCurrentRoom().fixed_description,
```

This is only the room's `fixed_description` column — raw architecture prose. The full LOOK output (assembled by `assembleBlurb` in `main-handler.ts`) also includes:

- Each **item**'s `room_blurb` (or disturbed template)
- Each **monster**'s `room_blurb`
- Each **scenery** item's `room_blurb`
- The exits line (`Exits: north, east`)

The PRD requires:

> Player story 27: monsters and items to be described inside the room's `look` output so that the room reads as a single scene.
> Player story 4: type `look` and see a description of my current room.

On world-load, the player is placed in the room without seeing monsters, items, scenery, or exits — they only see the bare architectural description. They would have to immediately type `look` to get the full picture. The `look` command itself works correctly (it calls `assembleBlurb`); the discrepancy is only at world-load time.

## What to fix

In `src/main.ts`, both `open-world-file-picker` and `continue-world` IPC handlers need to build a full assembled room description instead of using `fixed_description` directly.

The helpers needed already exist in `world-db.ts`:

```ts
const room = worldDB.getCurrentRoom();
const scenery = worldDB.getSceneryForRoom(room.id);
const items = worldDB.getItemsInRoom(room.id);
const monsters = worldDB.getMonstersInRoom(room.id);
const exits = worldDB.getCurrentRoomExits();
```

And `assembleBlurb` from `blurb-assembler.ts` can be imported into `main.ts`.

Both handlers should replace `worldDB.getCurrentRoom().fixed_description` with a call to `assembleBlurb(room, { items, monsters, scenery, exits })`.

## Acceptance criteria

- [ ] On creating a new world, the initial displayed text includes scenery blurbs and exits from the starting room (if present in WORLD.md frontmatter).
- [ ] On continuing a world, the initial displayed text includes any items, monsters, and scenery in the player's current room.
- [ ] `LOOK` command still produces identical output (no regression).
- [ ] The `flatland.md` world (in `worlds/`) shows "Exits: north, east" on initial load.

## PRD user stories addressed

- User story 3 (first world loads with hand-authored starting room, tone set immediately)
- User story 4 (look sees description of current room)
- User story 10 (rooms persistent across sessions — continuing world shows accurate state)
- User story 27 (monsters and items described inside room's look output)
