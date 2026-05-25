# Lore, Loot, and Monsters — An Interactive RPG

## Product Requirements Document (v1)

## Problem Statement

Interactive fiction is bounded by what its authors can hand-write. A player exhausts the world's content in hours and the experience ends. There is no commercial or open-source framework that turns a small, static "world bible" into an infinitely explorable text-adventure world while preserving spatial coherence, persistent state, and rigid gameplay mechanics across sessions. Players who love classic IF (Zork, Anchorhead) have to choose between hand-crafted finite worlds or chat-style LLM roleplay that has no real persistence, no real geography, and no real mechanics.

## Solution

A local Electron application that serves as a framework for infinite, procedurally generated interactive fiction. A user supplies a short markdown world bible (`WORLD.md`); the engine uses it to lazily generate rooms, monsters, and items as the player explores, committing each one to a per-world SQLite database so the geography is permanent. The engine talks to a locally-running Ollama instance for all generation. The player interacts with the world via a classic IF text loop (`look`, `n`, `take lantern`, `attack the goblin with my torch`), with a fast natural-language parser sitting in front of a small set of rigid mechanical verbs. Combat, inventory, and movement are resolved by deterministic engine code; the LLM is responsible only for generating narrative content and parsing intent. The world is a strict (x,y,z) grid so spatial intuition holds; rooms once generated are static thereafter. Each "save" is one world folder containing the `WORLD.md` that seeded it and the SQLite database that holds its accumulated state. Players who finish exploring one world can author or download another `WORLD.md` and start a new infinite exploration.

## User Stories

1. As a player, I want to launch the app and see a list of my existing worlds so that I can pick one to continue.
2. As a player, I want to create a new world by selecting a `WORLD.md` file from disk so that I can play in any setting an author has written.
3. As a player, I want my first world to load with a hand-authored starting room described in the world bible so that the world's tone is set immediately.
4. As a player, I want to type `look` and see a description of my current room so that I can understand my surroundings.
5. As a player, I want to type `n`, `s`, `e`, `w`, `u`, or `d` to move in cardinal directions so that movement feels fluid.
6. As a player, I want to type full directions (`north`, `go south`) and have them work identically to shortcuts so that I am not punished for verbosity.
7. As a player, I want my first move in an unexplored direction to trigger generation of a new room consistent with the world's theme so that exploration always reveals something coherent.
8. As a player, I want to be able to return the way I came and arrive at the previous room exactly as I left it so that the world feels permanent.
9. As a player, I want to walk in a square (`n e s w`) and arrive back at my starting room so that the world's geography behaves like a real place.
10. As a player, I want rooms to be persistent across sessions so that quitting and re-opening returns me to exactly where I left off.
11. As a player, I want to type natural-language commands like "smack the goblin with my torch" and have them interpreted correctly so that I am not forced to speak in verbs.
12. As a player, I want common shortcuts (`l` for look, `i` for inventory, `x foo` for examine foo) to be parsed instantly without LLM overhead so that play is fast.
13. As a player, I want to attack monsters with the `attack` verb and have damage resolved by deterministic engine math so that combat outcomes are fair and reproducible.
14. As a player, I want combat to take roughly 5–10 turns per monster so that fights have weight without becoming slogs.
15. As a player, I want my equipped weapon to update automatically when I pick up a stronger one so that I do not have to manage an equip verb.
16. As a player, I want to carry an unlimited number of weapons so that I can accumulate a collection as a record of my progress.
17. As a player, I want every monster I defeat to drop a weapon so that combat is always worth engaging.
18. As a player, I want my health to reset to full and my position to return to the starting room when I die so that death is a setback but not a loss.
19. As a player, I want monsters whose rooms I died fighting in to be fully healed when I respawn so that I cannot trivially chip them down with repeated suicide runs.
20. As a player, I want to keep all my items when I die so that exploration progress is not punished.
21. As a player, I want to `take` items I find so that I can wield them.
22. As a player, I want to `drop` items so that I can manage my carry.
23. As a player, I want a dropped item to stay where I left it across sessions so that the world remembers what I have done.
24. As a player, I want to view my inventory with `i` or `inventory` so that I can recall what I have collected.
25. As a player, I want `look at` (or `examine`, `x`) on any item, monster, or scenery object to return a description so that I can investigate everything I see.
26. As a player, I want to attempt to `take` mentioned-but-decorative scenery (pews, banners, walls) and receive an in-world refusal so that the world feels responsive rather than dismissive.
27. As a player, I want monsters and items to be described inside the room's `look` output so that the room reads as a single scene.
28. As a player, I want a monster I killed or an item I took to no longer appear in subsequent `look`s of that room so that the description matches reality.
29. As a player, I want the room description itself (walls, architecture, lighting) to stay constant across visits so that I can recognize a place I have been before.
30. As a player, I want to see my current HP, equipped weapon, and current room name on a persistent HUD so that I do not have to type commands to check basic state.
31. As a player, I want to use up- and down-arrows to recall previous commands so that I can re-issue or correct mistakes quickly.
32. As a player, I want the input box to be locked while the engine is generating content so that I cannot accidentally queue up commands.
33. As a player, I want a confirmation modal before "starting over" a world so that I do not accidentally erase my progress.
34. As a player, I want my game to auto-save after every action so that I never lose meaningful progress.
35. As a player, I want refusal messages ("you can't go that way", "nothing to attack") to optionally be themed to the world so that even friction feels in-character.
36. As a player, I want a small in-game indicator when world generation fails so that I understand why something looks "off" rather than thinking the game is broken.
37. As a player, I want an "Open Log Folder" button so that I can inspect or share logs when reporting bugs.
38. As a player, I want my crashes and force-quits not to corrupt my world so that I can trust the app with long sessions.
39. As a world author, I want to write a `WORLD.md` file with frontmatter for the starting room and prose for the world's tone, lore, and visual style so that I can fully control the setting.
40. As a world author, I want my `WORLD.md` body to be included in every generation skill's system prompt so that all generated content stays in tone.
41. As a world author, I want to optionally override refusal messages in the `WORLD.md` frontmatter so that even the engine's default voice fits my world.
42. As a world author, I want the engine to validate my `WORLD.md` and reject malformed files with a clear error so that I can debug authoring problems.
43. As a developer, I want a configurable Ollama heavy model and light model so that I can run the engine on different hardware tiers.
44. As a developer, I want the engine to detect that Ollama is running and that the configured models are pulled, and offer remediation if they are not, so that first-launch is smooth.
45. As a developer, I want all LLM outputs to be strictly JSON-schema validated with up to 3 retries and a documented fallback per skill so that the engine never hangs on a bad generation.
46. As a developer, I want a session-scoped JSONL event log capturing player input, parsed intent, LLM calls, state mutations, refusals, generation events, and errors so that I can debug any reported issue offline.
47. As a developer, I want a versioned schema with a migration runner from day one so that I can evolve the data model without breaking existing worlds.
48. As a developer, I want the engine and the renderer to be cleanly separated by a typed IPC contract so that the UI can be swapped without touching gameplay logic.
49. As a developer, I want all deep gameplay logic (topology, parsing, combat, balance, blurb assembly, target resolution, world loading, refusals, retry runner) extracted into pure-function modules so that they are testable in isolation.
50. As a developer, I want unit tests for every deep module and an integration test for the turn loop against a mocked Ollama so that I can refactor with confidence.

## Implementation Decisions

### Architecture

- **Platform:** Electron application, packaged with Electron Forge using the Vite template.
- **Language:** TypeScript in strict mode on both main and renderer processes.
- **Process split:** Main process owns the engine — SQLite, Ollama client, all gameplay logic, world loading, logging, migrations. Renderer is a pure view; it has no Node integration. The two communicate via `contextBridge` exposing a typed IPC API.
- **IPC contract:** Renderer sends `submitInput(text)` and similar narrow commands. Main responds asynchronously with structured updates of the form `{ narrative: string[], hud: { hp, max_hp, weapon, room_name }, awaiting_disambiguation?: string }`.
- **SQLite library:** `better-sqlite3`, used synchronously (turn-based engine, no need for async DB).
- **Ollama client:** `ollama-js`.
- **Streaming:** off in v1. All LLM outputs are structured JSON and require full response before parsing.

### LLM configuration

- Two configurable Ollama models: a **heavy model** for Room/Monster/Item generation, and a **light model** for intent parsing.
- Both model tags live in app configuration and can be edited by the user. Defaults to be chosen and confirmed at implementation time (preliminary picks were noted in the design conversation but the exact Ollama tag strings need verification).
- On startup, the engine detects whether Ollama is reachable at `http://localhost:11434` and whether both configured model tags are pulled. If either check fails, a setup screen is shown with remediation actions (instructions + retry, and an "Install Models" button that runs `ollama pull` in the background).

### World and save model

- One save per world. A world is a directory under `userData/worlds/<world-folder>/` containing `WORLD.md` (frozen at world-creation time) and `world.sqlite`.
- A user-supplied `WORLD.md` is the only extension point: it sets theme, lore, visual style, and the starting room.
- `WORLD.md` format: **YAML frontmatter + markdown body**.
  - Frontmatter holds structured data: `title`, the full `starting_room` (with `name`, `fixed_description`, `exits`, optional `items`, `monsters`, `scenery`), and optional `refusals` overrides.
  - Markdown body holds free-form prose (Tone & Style, Lore, Visual Style sections by convention) and is included verbatim in the system prompt of every generation skill, including intent parsing.
- The starting room is inserted at coordinates `(0,0,0)` on new game.
- World picker UI on app start: lists existing worlds with Continue / Start Over / Delete buttons, plus a "Create New World" button that opens a file picker for `WORLD.md`.
- "Start Over" requires modal confirmation; it erases the world's SQLite but preserves log files for debugging.
- `WORLD.md` is read at world-load and cached. Mid-session edits to the file are not picked up; reload the world to refresh.

### World topology and generation

- The world is a strict 3D grid of `(x, y, z)` integer coordinates.
- Cardinal exits only: `N`, `S`, `E`, `W`, `U`, `D`. No non-cardinal exits in v1.
- Bidirectional consistency is mechanical: when a new room is created via, e.g., `EAST` from room A, the new room's `WEST` exit is forced to point back to A.
- **Loop closure:** before generation, the engine queries whether the target coordinate is already occupied. If yes, the existing room is linked instead and the back-exit is retro-added if missing. If no, generation proceeds.
- **Exit generation contract:** the Room Generation Skill prompt includes pre-computed neighbor state for the target coordinate (e.g., "north: existing room 'The Chapel'; east: empty; south: empty; west: forced back-exit"). The LLM picks which non-forced cardinal directions to expose as exits.
- Room descriptions are static once committed. Mutations come only from entities entering/leaving the room.

### Room Generation Skill

- Inputs: WORLD.md body, previous room's `fixed_description`, direction traveled, target coordinates' neighbor state.
- Output (single JSON object validated against schema):
  - `name`: short room title.
  - `fixed_description`: prose describing architecture/atmosphere only, naming no items/monsters/scenery (those have their own blurbs).
  - `items`: 0–3 objects, each with `name`, `inspection_description`, `room_blurb`, `damage_min`, `damage_max`, `type: "weapon"`.
  - `monsters`: 0–1 objects, each with `name`, `inspection_description`, `room_blurb`, `hp`, `damage_min`, `damage_max`, and a nested `drop` (one weapon item with its own `name`, `inspection_description`, `room_blurb` written for the post-death "lying on the ground" state, `damage_min`, `damage_max`).
  - `scenery`: 0–N objects, each with `name`, `inspection_description`, `room_blurb`.
  - `exits`: subset of allowable non-forced cardinal directions.
- Numeric stats for monsters and items must lie within engine-supplied bounds; out-of-range values are a validation failure and trigger retry.

### Combat and player state

- Player has `hp` and `max_hp` (default 20).
- Player has an `equipped_weapon_id` (nullable; `null` means unarmed, fist damage `1–2`).
- Auto-equip rule: on `TAKE` of a weapon, if the new weapon's average damage is greater than the current equipped weapon's, it is auto-equipped. No explicit `EQUIP` verb.
- Inventory: unlimited size.
- Combat is per-command turn-based. `ATTACK` resolves one exchange: player damage roll against the monster, then if the monster survives, monster damage roll against the player.
- Monsters do not act outside combat. Once combat is initiated, monsters retaliate on every subsequent player command in the same room, including `MOVE` (movement succeeds but takes a parting hit).
- Difficulty is **flat**: monster HP bounds are computed from the player's currently-equipped weapon's average damage as `target_hp ∈ [avg_damage × 5, avg_damage × 10]`. Monster damage bounds are computed similarly so a 5–10 round fight against a 20-HP player is the target.
- Bounds are passed into the Monster Gen Skill prompt; the LLM picks within them.
- Monster drops are **always** one weapon, pre-generated by the Monster Gen Skill in the same JSON output. The drop item is stored with `location = "monster:<monster_id>"`; on monster death the location flips to `"room:<room_id>"`.
- Player death triggers respawn: position resets to starting room, HP refills to `max_hp`, inventory is preserved, all dropped items stay where they are, and every monster the player engaged has its HP refilled to maximum.

### Items and scenery

- Items table includes: `id`, `name`, `inspection_description`, `room_blurb`, `type`, `damage_min`, `damage_max`, `location` (polymorphic string: `room:<id>` | `player_inventory` | `monster:<id>`), `disturbed` (boolean, defaults false).
- `type` enum is open-ended; v1 only uses `"weapon"`. Future types (consumable, key, light source) require migrations.
- `disturbed` flips to `true` permanently the first time the player `TAKE`s the item. While `disturbed` is false and the item is in a room, the LOOK output uses the item's authored `room_blurb`. Once `disturbed`, the LOOK output uses a deterministic template (e.g., `"A {name} lies on the ground here."`).
- Scenery is a separate table: `id`, `room_id`, `name`, `inspection_description`, `room_blurb`. Scenery is non-takeable and never moves.

### LOOK assembly

- `LOOK` (no argument): the room view is composed as `fixed_description` + each present item's `room_blurb` (with the `disturbed` rule) + each present monster's `room_blurb` + each scenery's `room_blurb`. Joined with whitespace.
- `LOOK AT <item-in-room|item-in-inventory|monster-in-room|scenery>`: returns the matched entity's `inspection_description`.
- `LOOK AT <unknown noun>`: returns the `nothing_here_named` refusal (or its WORLD.md-supplied override).

### Intent parsing

- The Intent Matching Skill is a two-stage pipeline.
- **Stage 1 — deterministic patterns.** Regex/tokenizer recognizes:
  - Single-word direction shortcuts and `go <direction>`.
  - Bare verbs: `look`/`l`, `inventory`/`i`/`inv`.
  - Verb + target: `(take|get|grab|pick up) X`, `drop X`, `(attack|fight|hit|kill) X?`, `(look at|examine|x) X`.
  - Targets are resolved against in-scope entities via the Target Resolver.
- **Stage 2 — LLM fallback.** If no deterministic pattern matches, the input is sent to the light model with WORLD.md body in the system prompt. The model outputs the same JSON shape as the deterministic path (`{ command, target?, instrument? }`).
- Chained commands are rejected: if the LLM returns something that parses as multiple intents, the engine asks the player to do one thing at a time.
- The `instrument` field is preserved in the parsed Intent but not used by combat in v1 (the engine always uses the auto-equipped weapon).

### Target resolution

- Given a target string and a scope (room items + room monsters + room scenery + inventory items), the Target Resolver does substring / prefix matching against entity names and returns one of: unique match, ambiguous (with candidate list), or no match.
- On ambiguous, the engine asks "Which one? a, b, or c?" and locks input until the player disambiguates.

### Refusal voice

- Refusal messages flow through a Refusal Bank keyed by a fixed taxonomy: `no_exit`, `nothing_to_take`, `nothing_here_named`, `nothing_to_attack`, `inventory_empty`, `cannot_take_scenery`, `cant_drop_what_you_dont_have`, `intent_unparseable`, `generation_failed`, etc.
- Each key has a hardcoded English default. WORLD.md frontmatter may override any subset via a `refusals:` map.
- `cannot_take_scenery` default behavior is to return the targeted scenery's `room_blurb`; the override key can replace this with a generic refusal.

### JSON retry and fallback

- The JSON Retry Runner wraps every LLM call. Up to 3 attempts total (1 initial + 2 retries). Each retry appends the previous bad output and a structured error description to the prompt.
- Failure types treated as retryable: malformed JSON, schema violation, value out of engine-supplied bounds, reference to invalid identifiers.
- Per-skill fallbacks on terminal failure:
  - **Room Gen:** insert a minimal "liminal Gap" room with just `name`, a generic `fixed_description`, and the forced back-exit. No items, no monsters, no scenery.
  - **Monster Gen / Item Gen:** skip the spawn for this room.
  - **Intent Parser:** return `intent_unparseable` refusal to the player.
- Every fallback writes a clear event to the session log.

### Persistence and migrations

- All state changes commit immediately to SQLite via the synchronous `better-sqlite3` API. There is no `SAVE` verb.
- No `QUIT` verb; closing the window exits the app cleanly.
- A `schema_version` table is present from day one, populated with `1`. The Migration Runner compares the DB's version to the engine's expected version on world-open. Lower → apply pending migrations in numeric order. Higher → refuse to open and prompt the player to update the engine.

### Logging

- One JSONL file per session, at `userData/logs/<world-folder>/<ISO-timestamp>.jsonl`.
- A "session" is the lifetime of a loaded world within an app process.
- Event types logged: `llm.call`, `input.raw`, `input.parsed`, `state.mutate`, `refusal`, `gen.room`, `gen.monster`, `gen.item`, `error`, `session.start`, `session.end`.
- No telemetry. All logs stay on disk.
- A "Open Log Folder" button in the world picker exposes the directory.

### UI shell (renderer)

- Layout: thin top HUD (HP / equipped weapon / current room name) + scrollable prose log (monospace font) + single-line input box at the bottom.
- Color palette of at most 4 roles: player input, narrative, system messages, damage/death events.
- Up- and down-arrow command history (in-memory, per session, not persisted).
- Input box is disabled while the main process is generating; a small spinner indicates work.
- Unlimited in-session scrollback; only the most recent ~100 lines are ever sent to the LLM as context (the rest exists for player re-reading).
- No map view in v1.

### Deep modules

The following modules are extracted as pure-function (or near-pure) units with simple interfaces. They contain the heavy logic and rarely change shape:

- **GridTopology** — coordinate arithmetic, neighbor lookup, exit-direction reciprocity.
- **IntentParser (deterministic half)** — regex/tokenizer over player input.
- **TargetResolver** — fuzzy match against in-scope entity names with ambiguity reporting.
- **CombatResolver** — one-exchange combat resolution given player, weapon, monster.
- **BalanceCalculator** — monster HP/damage bounds from current weapon.
- **BlurbAssembler** — composes the LOOK output from `fixed_description` + present-entity blurbs, applying the `disturbed` rule.
- **WorldFileLoader** — parses and validates `WORLD.md` (frontmatter + body).
- **RefusalBank** — produces refusal messages keyed by category with WORLD.md overrides.
- **JsonRetryRunner** — generic LLM-call-with-schema-validation-and-retry wrapper.

### Glue and orchestration

These are thinner coordinators that wire deep modules together with the DB and LLM:

- **RoomGenerationOrchestrator** — gathers context, invokes Room Gen via JsonRetryRunner, commits results to DB.
- **MonsterGenerationOrchestrator** — same shape for monsters and their drops.
- **TurnLoop** — receive input → parse → resolve → mutate → log → return update to renderer.
- **MigrationRunner** — schema version check + ordered application.
- **EventLogger** — JSONL appender for the session log.
- **OllamaClient** — thin wrapper around `ollama-js` with model config.
- **IPC layer** — typed contract between main and renderer.

### Schema

High-level tables (final column lists determined at implementation time):

- **rooms** — `id`, `x`, `y`, `z`, `name`, `fixed_description`.
- **exits** — `id`, `source_room_id`, `direction`, `destination_room_id`.
- **items** — `id`, `name`, `inspection_description`, `room_blurb`, `type`, `damage_min`, `damage_max`, `location`, `disturbed`.
- **monsters** — `id`, `name`, `inspection_description`, `room_blurb`, `hp`, `max_hp`, `damage_min`, `damage_max`, `location` (room_id or graveyard sentinel).
- **scenery** — `id`, `room_id`, `name`, `inspection_description`, `room_blurb`.
- **player_state** — single-row table: `hp`, `max_hp`, `current_room_id`, `equipped_weapon_id`.
- **schema_version** — single-row table: `version`.

## Testing Decisions

A good test exercises **external behavior** of a module — its inputs, outputs, and observable side effects through its public interface — and never reaches into implementation details (private functions, internal data structures, ordering of intermediate calls). Tests should be written so that refactoring the module's internals does not require rewriting the tests, as long as the contract holds.

Test coverage by module:

- **Unit tests, against the public interface:**
  - GridTopology — coordinate math, reciprocal-direction lookup, neighbor enumeration.
  - IntentParser (deterministic half) — every documented pattern, plus negative cases that should fall through to the LLM stage.
  - TargetResolver — unique match, ambiguous match (correct candidate list), no match, case-insensitivity, prefix vs substring behavior.
  - CombatResolver — damage roll bounds, death detection for player and monster, edge cases (zero damage, lethal hits).
  - BalanceCalculator — bounds calculation for a range of weapon damage values, including unarmed (fist).
  - BlurbAssembler — assembly order, `disturbed` template substitution, behavior when entities are absent.
  - WorldFileLoader — well-formed `WORLD.md` parsing, frontmatter validation failures, missing required fields, optional fields, refusal overrides round-tripping.
  - RefusalBank — default fallback, WORLD.md override application, unknown keys.
  - JsonRetryRunner — success on first try, success after retries, terminal failure after 3 attempts, error-feedback enrichment on retries (verified by inspecting the calls the runner makes to its injected LLM stub).
- **Integration tests, against a mocked Ollama:**
  - TurnLoop — end-to-end input-to-update flow for representative scenarios: move into existing room, move into unmapped exit (triggering room generation), TAKE a known item, TAKE an unknown noun, ATTACK with and without auto-equipped weapon, player death and respawn, monster death and drop placement.
  - Mocked Ollama returns canned JSON outputs to keep tests deterministic.

Modules **not** covered by tests in v1:

- Orchestrators (RoomGenerationOrchestrator, MonsterGenerationOrchestrator) — exercised via TurnLoop integration tests.
- MigrationRunner — trivial enough that the integration test will catch regressions implicitly.
- EventLogger — trivial appender; manually inspected.
- OllamaClient — pure wrapper; exercised in integration via the mock.
- IPC layer — typed contract; correctness comes from the TypeScript type system.

There is no existing prior art for tests in this codebase (greenfield). The test runner choice (Vitest, Jest, or Node's built-in `node:test`) is to be decided at implementation time; preference for a tool that integrates cleanly with the Electron Forge + Vite stack.

## Out of Scope

The following are deliberately excluded from v1 and may be addressed in later versions:

- Non-weapon item types (consumables, keys, light sources, lore items).
- Healing items or any mechanism to recover HP other than respawn.
- Multi-monster rooms.
- Non-cardinal exits (archways, trapdoors, "into the cave").
- Monster dialog or non-combat monster interactions.
- Progression systems: XP, levels, gold, ability unlocks.
- Difficulty curve based on distance from origin.
- An explicit `EQUIP` verb; auto-equip handles all equipping in v1.
- An explicit `QUIT` or `SAVE` verb.
- A map view of the explored grid.
- LLM-narrated refusals (refusals are hardcoded English with WORLD.md overrides, never live LLM calls).
- LLM-narrated re-LOOKs (LOOK is fully deterministic).
- Garbage collection of dropped items; they persist forever.
- Mid-session reloading of `WORLD.md` edits.
- Multi-save slots per world.
- Modding beyond `WORLD.md` (no skill/prompt/UI extension points).
- Telemetry or any network logging.
- Streaming LLM output.
- Multi-step / chained commands.
- Player-initiated saves to named slots.
- Map rendering, fog of war, automap.

## Further Notes

- The "framework" framing of the original concept is preserved: `WORLD.md` is the single, intended extension point for users. Engine code is not designed as a public API surface in v1; modders who want to alter mechanics will fork.
- The flat-difficulty balance model means weapon collection is purely cosmetic / sentimental. This is an intentional simplification for v1 and the user has accepted it.
- Combat-incentive depends entirely on monster drops (since flat balance means no stat progression). If monster drops are ever removed or made conditional in a later version, the combat-engagement question must be re-examined.
- The JSONL session log will be large and verbose. It is the primary debugging surface, and the verbosity is deliberate. The "Open Log Folder" UI is the only end-user-facing affordance for managing it; users are expected to delete old logs manually.
- The schema_version migration runner is built from day one even though no migrations exist yet, to avoid a painful retrofit when the first migration is needed.
