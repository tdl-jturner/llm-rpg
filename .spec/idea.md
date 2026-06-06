Here is the high-level Product Requirements Document (PRD) synthesizing your architecture and mechanics.

## Product Overview

An electron app serving as a framework for infinite, procedurally generated interactive fiction. The engine uses a lazy-loading generation system (JIT generation) to build a persistent, graph-based world. Thematic guardrails are provided by a static `WORLD.md` file, while a SQLite database ensures absolute persistence of spatial topology and entity states.

---

## 1. Core Architecture

* **Environment:** electron app that calls out to an ollama based llm.
* **State Management:** SQLite database handling the graph topology (rooms/edges), entity states (monsters/items), and player state (inventory/location).
* **Generation Format:** All LLM skills enforce strict JSON outputs. The engine includes an automatic retry loop if the JSON fails to parse.
* **Thematic Anchor:** A static `WORLD.md` file passed in the system prompt for all generation skills to dictate tone, lore, and visual style.

## 2. World & Spatial Generation

The world is an infinitely expanding graph of nodes (rooms).

* **Node Linking (Graph Topology):** Exits are relational, not strictly geographical.
* **Bidirectional Consistency:** If a player moves `EAST` from Room A to newly-generated Room B, the engine automatically hardcodes the `WEST` exit of Room B to point back to Room A.
* **JIT Room Generation:** When a player selects an unmapped exit, the **Room Generation Skill** fires. Its context window includes:
* `WORLD.md` (Global theme)
* The previous room's description (Local consistency)
* The direction traveled


* **Exit Generation:** The LLM defines the available exits for the new room (excluding the hardcoded return path). There are no boundary limits; the world can sprawl infinitely.
* **Static Rooms:** Once generated and committed to SQLite, a room's core description and exits become static and are served strictly from the database on subsequent visits.

## 3. Entity Management (Monsters & Items)

Entities exist independently of rooms but are relationally mapped to them.

* **Delegated Spawning:** The **Room Generation Skill** acts as the director. It decides if a room contains a monster or an item. If yes, it invokes the **Monster Generator** or **Item Generator** sub-skills.
* **Location State:** Monsters and Items share a database pattern where their `location` is a mutable foreign key.
* For items: `location` can be a `room_id` or `player_inventory`.
* For monsters: `location` is a `room_id` (or a graveyard state if defeated).


* **Hardcoded Combat Stats:** The Monster Skill generates narrative descriptions alongside rigid numeric stats (e.g., `hp: 30`). The Item Skill generates weapons with rigid damage bounds (e.g., `damage_min: 2, damage_max: 6`).

## 4. Player Interaction & The NLP Parser

The engine supports a rigid set of core mechanical verbs, but allows players to use natural, expressive language.

* **Core Verbs:** `MOVE [direction]`, `LOOK`, `TAKE [item]`, `DROP [item]`, `ATTACK [monster]`, `INVENTORY`.
* **Intent Matching Skill:** Player input is first checked against a deterministc pattern. if it isn't found then it is routed through a lightweight, fast LLM prompt that translates natural language into the engine's core verbs.
* *Input:* "Smack the goblin in the face with my torch"
* *Output:* `{"command": "ATTACK", "target": "goblin", "instrument": "torch"}`


* **Deterministic Mechanics:** Once intent is parsed, resolution is handled by hardcoded engine logic, not the LLM. If the user attacks, the app (not the llm) calculates the random damage roll against the monster's static HP and outputs the result.

---

## 5. High-Level DB Schema Concept

| Table | Core Columns | Purpose |
| --- | --- | --- |
| **Rooms** | `id`, `name`, `description` | Stores the static narrative data once generated. |
| **Exits** | `id`, `source_room_id`, `direction`, `destination_room_id` | Maps the graph edges. |
| **Items** | `id`, `name`, `description`, `damage_min`, `damage_max`, `location` | Tracks physical objects and where they currently reside. |
| **Monsters** | `id`, `name`, `description`, `hp`, `max_hp`, `location` | Tracks enemies and their current health/location. |
