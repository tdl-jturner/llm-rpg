# 007 — Room Generation Skill (Real LLM Replaces Stub)

## Parent PRD

`issues/prd.md`

## What to build

Replace the deterministic stub from slice 004 with the real Room Generation Skill calling the heavy model via the validated OllamaClient.

Build the Room Generation Skill:

- **Inputs gathered by the engine:** the full WORLD.md body (verbatim, as system prompt context), the previous room's `fixed_description`, the direction traveled, and pre-computed neighbor state for the target coordinates (each cardinal direction: "empty", "existing room named X", or "forced back-exit to previous room").
- **JSON schema enforced on the response (this slice only):** `name` (string), `fixed_description` (string, prose describing architecture/atmosphere only — naming no items/monsters/scenery), `exits` (array of direction strings, subset of allowable non-forced cardinal directions). Items / monsters / scenery come in later slices and are not yet required by the schema.
- **Prompt design:** assembles a system prompt (WORLD.md body + role description + JSON schema instructions) and a user prompt (the inputs above). Iterate on prompt wording against a few example WORLD.md files until generated rooms feel in-tone.
- The skill is invoked through the JsonRetryRunner from slice 004 with the real OllamaClient (not the stub).
- `llm.call` events join the session log alongside the existing `gen.room` events. The `gen.room` event now records `source: "llm"`.
- **Fallback on terminal failure (after 3 attempts):** insert a minimal "liminal Gap" room with name = "A Liminal Gap", a generic `fixed_description` (e.g., "A featureless gray space presses in around you. The way back is clear; nothing else is."), and only the forced back-exit. Log the failure as an `error` event. The renderer shows a one-line indicator below the room description: "(World generation hiccup logged.)".

See PRD sections: World topology and generation, Room Generation Skill, JSON retry and fallback, Logging.

## Acceptance criteria

- [ ] Movement through an unmapped exit triggers a real LLM call (verified by the `llm.call` event in the session log).
- [ ] Generated rooms have prose `fixed_description`s coherent with the WORLD.md theme (subjective verification with one or two example WORLD.md files).
- [ ] Loop closure from slice 005 still works against the real LLM (walking a square returns home).
- [ ] Bidirectional consistency still holds.
- [ ] Input lock + spinner UX from slice 004 continues to work; generation latency is now real (not artificial).
- [ ] When the LLM returns invalid JSON or schema-violating content, the JsonRetryRunner retries up to 3 times with structured error feedback in the retry prompt (verified by inspecting the session log).
- [ ] After 3 failed attempts, the "liminal Gap" fallback room is inserted, the failure is logged as an `error` event, and the one-line in-game indicator is shown.
- [ ] No game-breaking failures: in every test, the player can always continue play, even when generation fails.

## Blocked by

- Blocked by `issues/006-ollama-integration-smoketest.md`

## User stories addressed

- User story 7 (real generation)
- User story 36
- User story 40
- User story 45
