# 002 — SQLite + Migrations + Hardcoded Starting Room + LOOK + Movement Refusal

## Parent PRD

`issues/prd.md`

## What to build

Wire `better-sqlite3` into the main process. Build the MigrationRunner with a `schema_version` table seeded to `1` and the v1 schema for `rooms`, `exits`, `items`, `monsters`, `scenery`, `player_state`. On app start, open (or create) a single hardcoded world database in `userData/worlds/_dev/world.sqlite` and insert one starting room at coordinates `(0, 0, 0)` with a hardcoded name and `fixed_description`. Player state is inserted with `hp = max_hp = 20`, `current_room_id` pointing at the starting room, `equipped_weapon_id = null`.

Build deterministic intent parsing for: `look` / `l` (no argument), and direction shortcuts `n`/`s`/`e`/`w`/`u`/`d` plus their long forms and `go <direction>`. Build the degenerate BlurbAssembler that returns just `fixed_description` (no entities yet). Build the GridTopology module's coordinate math and reciprocal-direction lookup. Build the RefusalBank with hardcoded English defaults only (no WORLD.md overrides yet).

`LOOK` returns the starting room's `fixed_description`. Any direction input returns the `no_exit` refusal (the starting room has no exits in this slice). Auto-commit via the synchronous `better-sqlite3` API means quit/relaunch resumes exactly where the player left off (which, here, is always the starting room).

See PRD sections: Persistence and migrations, World topology and generation, LOOK assembly, Intent parsing, Refusal voice, Schema.

## Acceptance criteria

- [ ] On first launch, the world DB is created in `userData/worlds/_dev/world.sqlite` with all v1 tables and `schema_version = 1`.
- [ ] On subsequent launches, the existing DB is opened and the player resumes at the starting room.
- [ ] `LOOK` and `l` both return the starting room's `fixed_description`.
- [ ] All direction inputs (`n`, `north`, `go north`, `s`, `e`, etc.) return the `no_exit` refusal.
- [ ] Unrecognized commands return the `intent_unparseable` refusal.
- [ ] Force-quitting the app mid-session loses no committed state on relaunch.
- [ ] MigrationRunner refuses to open a DB whose `schema_version` is higher than the engine's expected version, with a clear error.
- [ ] Unit tests for GridTopology (coordinate math, reciprocal directions), IntentParser deterministic patterns (every recognized shortcut, plus negative fall-through cases), BlurbAssembler (degenerate case), RefusalBank (default lookup, unknown key behavior).

## Blocked by

- Blocked by `issues/001-electron-ipc-bootstrap.md`

## User stories addressed

- User story 4
- User story 5
- User story 6
- User story 10
- User story 12
- User story 29
- User story 34
- User story 38
- User story 47
