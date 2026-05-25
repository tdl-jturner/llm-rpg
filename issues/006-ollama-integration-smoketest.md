# 006 — Ollama Integration + Smoke Test (HITL)

## Parent PRD

`issues/prd.md`

## What to build

The single human-in-the-loop checkpoint for the project. Validate that the engine can talk to Ollama end-to-end with the configured heavy and light models. No game content changes in this slice; the deterministic stub from slice 004 still powers actual room generation.

Build the OllamaClient module: a thin wrapper around `ollama-js` that takes a model tag, a prompt, and (optionally) a JSON-format flag, and returns the model's response. The heavy and light model tags are read from app configuration (default values defined in code; editable via a settings file).

Add an Ollama startup check that runs on world-load (after world picker, before the game UI):

- Reachability check: HTTP ping to `localhost:11434`. On failure, show the setup screen with install instructions, a "Retry" button, and a link to the Ollama download page.
- Model availability check: query `ollama list` (via the API); for any configured model tag that is not listed, show the setup screen with an "Install Models" button that runs `ollama pull` for each missing tag, with progress feedback.
- Smoke test: send a trivial prompt to each configured model with `format: "json"` — e.g., `"Respond with exactly the JSON object {\"ok\": true}."`. Validate the response parses to `{ok: true}`. Run the smoke test through the JsonRetryRunner from slice 004 (real LLM as the injected function). On failure, surface a clear error on the setup screen.

The smoke test is the slice's demoable: a human verifies that the setup flow works on their machine with the chosen models.

This slice does NOT yet integrate Ollama with the game's room generation — that happens in slice 007. The game still uses the deterministic stub here.

See PRD sections: LLM configuration, JSON retry and fallback.

## Acceptance criteria

- [ ] On world-load, if Ollama is unreachable, the setup screen appears with instructions; clicking Retry re-runs the check.
- [ ] If either configured model is not pulled, the setup screen offers a one-click install with visible progress; on completion, the check re-runs.
- [ ] Smoke test runs automatically after detection + model checks pass; success message confirms both models work; failure surfaces a specific error and a Retry button.
- [ ] Smoke test exchanges (request + response) are logged to the session log as `llm.call` events.
- [ ] Heavy and light model tags are configurable via a settings file under `userData/`; defaults are shipped in the app.
- [ ] After the setup screen passes, the player drops into the game UI, where room generation still uses the deterministic stub from slice 004.
- [ ] Verified by hand on a real machine: the developer installs Ollama, pulls the configured models, launches the app, and sees the smoke test pass.

## Blocked by

- Blocked by `issues/005-loop-closure.md`

## User stories addressed

- User story 43
- User story 44
