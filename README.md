# LLM RPG

Infinite, procedurally generated interactive fiction. Write a short world bible (`WORLD.md`), launch the app, and explore a world that expands forever as you walk through it.

## How it works

The engine lazily generates rooms, monsters, and items as you move into unexplored directions — but once generated, everything is permanent. Walk north, come back south, and the room is exactly as you left it. The world is stored in a SQLite database per world; closing and reopening the app returns you to wherever you were.

All generation calls a locally-running [Ollama](https://ollama.com) instance. Combat, inventory, movement, and target resolution are handled by deterministic engine code — the LLM only generates narrative content and parses natural-language intent.

## Requirements

- [Node.js](https://nodejs.org) 20+
- An LLM provider — choose one:
  - **Ollama** (local): [ollama.com](https://ollama.com), running at `http://localhost:11434` with at least one model pulled
  - **Google AI Studio** (cloud): a free API key from [aistudio.google.com](https://aistudio.google.com)

On first launch a setup screen lets you pick your provider, enter credentials, and verify connectivity before creating a world.

## Getting started

```bash
npm install
npm start
```

On launch you'll see a world picker. Click **Create New World**, select a `WORLD.md` file, and start exploring.

## Example worlds

Two ready-to-play worlds live in [`worlds/`](worlds/):

- [`dungeon.md`](worlds/dungeon.md) — The Dungeon of Aethon: a dark, claustrophobic underground complex full of ancient creatures
- [`forest.md`](worlds/forest.md) — The Verdant Labyrinth: a vast, overgrown forest that may or may not be dreaming

## Writing a WORLD.md

A world file is a YAML frontmatter block followed by free-form markdown prose.

```yaml
---
title: The Sunken Archive
starting_room:
  name: The Vestibule
  fixed_description: >
    Cracked marble floors stretch toward a collapsed archway. Dust motes hang
    in a shaft of green light filtering through the rubble above.
  exits: [north, east]
---

## Tone & Style
Crumbling pre-war architecture. Flickering bioluminescence. A world that drowned
slowly and is only now being rediscovered.

## Lore
...
```

The markdown body is injected into the system prompt for every generation call, keeping all generated content tonally consistent with your world. The frontmatter `starting_room` is inserted at coordinates `(0,0,0)` when the world is first created.

Optional frontmatter keys:

| Key | Purpose |
|-----|---------|
| `refusals` | Override default refusal messages with in-world alternatives |

## Commands

| Input | Action |
|-------|--------|
| `n`, `s`, `e`, `w`, `u`, `d` | Move in a cardinal direction |
| `north`, `go north`, etc. | Same as shortcut |
| `look` / `l` | Describe the current room |
| `look at <thing>` / `x <thing>` | Examine an item, monster, or scenery |
| `take <item>` / `get <item>` | Pick up an item |
| `drop <item>` | Drop an item in the current room |
| `attack <monster>` | Attack a monster (one combat exchange) |
| `inventory` / `i` | List carried items |

Natural language works too — "smack the goblin with my torch" is understood.

## Combat

Combat is turn-based and per-command. One `attack` command resolves one exchange: your damage roll, then the monster's retaliation. Monsters do not act outside combat, but they take a parting shot if you move out of a room mid-fight.

Every monster drops a weapon on death. Picking up a weapon with higher average damage than your current one equips it automatically.

If you die: you respawn at the starting room with full HP, keeping all your items. Every monster you fought has its HP refilled.

## Configuration

Provider and model settings are accessible from the app.

| Setting | Description |
|---------|-------------|
| **Provider** | `ollama` (local) or `google-ai-studio` (cloud) |
| **Google API key** | Required when using Google AI Studio |
| **Heavy model** | Used for room, monster, and item generation (default: `qwen3.5:9b` / Gemini) |
| **Light model** | Used for intent parsing — should be fast and low-latency (default: `gemma4:e2b` / Gemini Flash) |

Settings are stored in `<userData>/config.json` and merged with defaults on each launch so new fields are never missing.

## Project structure

```
src/
  main/         # Electron main process: engine, SQLite, Ollama client, IPC
    modules/    # Pure-function deep modules (combat, topology, parser, etc.)
    skills/     # LLM generation skills (room gen, intent parsing)
  renderer/     # Electron renderer: UI shell (HUD + prose log + input)
  shared/       # Types shared across processes
```

The main process owns all gameplay logic. The renderer is a pure view with no Node integration; the two communicate over a typed `contextBridge` IPC contract.

## Development

```bash
npm test        # Run unit and integration tests (Vitest)
npm run typecheck  # TypeScript type check without emitting
```

## Logs

Each session writes a JSONL event log to `userData/logs/<world>/<timestamp>.jsonl`. The **Open Log Folder** button in the world picker opens it directly.
