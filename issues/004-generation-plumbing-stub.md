# 004 — Generation Plumbing with Deterministic Stub

## Parent PRD

`issues/prd.md`

## What to build

Build the entire room-generation pipeline EXCEPT the actual LLM call. This proves the architecture, persistence, UX, and bidirectional consistency without requiring Ollama.

Build the JsonRetryRunner deep module: takes an injected "LLM function" (any callable returning a string), a JSON schema, and a prompt; validates the response against the schema; retries up to 3 attempts total with structured error feedback appended on each retry; returns either the parsed result or a documented fallback signal. Tested in isolation against a fake LLM function that returns scripted responses.

Wire the runner into the movement flow: when the player moves through an unmapped exit (i.e., the starting room declares an exit to direction D but no room exists at the target coordinates yet), the engine invokes the runner with a deterministic stub "LLM" that returns a canned JSON room: `name = "Generated Room (x,y,z)"`, `fixed_description = "You step into an unremarkable space."`, `exits = [<the engine-supplied list of allowable non-forced cardinal directions>]`. The new room is committed to the DB with the forced back-exit wired up via GridTopology.

UX during generation: input box is locked; a small spinner animation plays in the input area; the stub sleeps an artificial ~500ms before returning to make the UX visible. Once the response is committed, input unlocks and the new room's description is rendered.

Build the minimal session JSONL logger (EventLogger). At this slice it captures only `gen.room` events (no `llm.call` yet, because no real LLM). Files are written to `userData/logs/<world-folder>/<ISO-timestamp>.jsonl`. Logger flushes on every event for crash-safety.

The fallback path in the JsonRetryRunner is implemented structurally but is unreachable with the deterministic stub.

See PRD sections: JSON retry and fallback, World topology and generation, Logging, UI shell (renderer).

## Acceptance criteria

- [ ] From the starting room, moving through any frontmatter-declared exit generates a new room (via stub) and commits it to the DB.
- [ ] Bidirectional consistency holds: from the new room, moving back in the reciprocal direction returns to the starting room (no regeneration).
- [ ] The new room's exits include the engine-supplied non-forced cardinal directions; moving through those generates further rooms; the world grows.
- [ ] Quit and relaunch returns the player to their current room with all previously-generated rooms intact.
- [ ] Input box is disabled and a spinner animates during the (~500ms) stub generation; input re-enables after the response is rendered.
- [ ] Session log file is created on world-load and contains a `gen.room` event for every generated room with `{room_id, coords, source: "stub"}`.
- [ ] JsonRetryRunner unit tests: success on first attempt, success after one retry (stub returns bad JSON then good), terminal failure after 3 attempts (stub always returns bad JSON), each retry's prompt contains the previous bad output and a structured error description.

## Blocked by

- Blocked by `issues/003-world-picker-worldmd-loading.md`

## User stories addressed

- User story 7 (partial — generation happens; content is canned)
- User story 8
- User story 32
