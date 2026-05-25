# 003 — World Picker + WORLD.md Loading + Starting Room from Frontmatter

## Parent PRD

`issues/prd.md`

## What to build

Replace the hardcoded starting room from the previous slice with one loaded from a user-supplied `WORLD.md`. Add a world picker UI as the app's first screen.

Build the WorldFileLoader deep module: parses YAML frontmatter + markdown body, validates the frontmatter schema (`title`, `starting_room` with `name` / `fixed_description` / `exits` / optional `items` / `monsters` / `scenery`, optional `refusals` map — the latter two are stored but not used yet). Surfaces clear validation errors on malformed files.

World picker UI behaviors:

- Lists existing worlds (subdirectories of `userData/worlds/`) by their `title` from `WORLD.md` frontmatter, with Continue / Start Over / Delete buttons.
- "Create New World" button opens a native file picker scoped to `.md` files. On selection, the engine parses + validates the file, creates a sanitized world folder under `userData/worlds/<sanitized-title>/`, copies the `WORLD.md` in, creates `world.sqlite`, runs migrations, and inserts the `starting_room` from frontmatter at coordinates `(0, 0, 0)`. Any authored scenery from frontmatter is inserted into the `scenery` table at this time. (Authored items/monsters from frontmatter are stored too but their LOOK behavior comes in later slices.)
- "Continue" opens the existing world and drops the player into their current room.
- "Start Over" requires modal confirmation; on confirm, deletes the world's `world.sqlite` (preserves logs and `WORLD.md`), runs the same insert flow as new-world creation.
- "Delete" requires modal confirmation; removes the entire world folder.

`WORLD.md` is cached at world-load. Mid-session edits to the file are not picked up; document this behavior.

See PRD sections: World and save model, Persistence and migrations.

## Acceptance criteria

- [ ] App launches into the world picker, not directly into a game.
- [ ] Selecting a valid `WORLD.md` creates a new world folder and drops the player into the authored starting room.
- [ ] The starting room's `fixed_description` (and any frontmatter-authored scenery's `room_blurb`) appears on `LOOK`.
- [ ] Selecting a malformed `WORLD.md` surfaces a specific validation error referencing the offending field; no world folder is created.
- [ ] Continue resumes a previously-played world at the player's last room.
- [ ] Start Over wipes the SQLite but keeps the world's logs folder; the player drops back into the freshly-inserted starting room.
- [ ] Delete removes the entire world folder.
- [ ] Two example `WORLD.md` files are shipped with the app under a `examples/` directory for users to try.
- [ ] Unit tests for WorldFileLoader: well-formed parsing (including all optional fields), required-field-missing failures, malformed YAML, malformed exits list, refusal-overrides round-trip.

## Blocked by

- Blocked by `issues/002-sqlite-starting-room-look.md`

## User stories addressed

- User story 1
- User story 2
- User story 3
- User story 33
- User story 39
- User story 42
