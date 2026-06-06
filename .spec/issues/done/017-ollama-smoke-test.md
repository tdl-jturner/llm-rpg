# 017 — Ollama Startup Smoke Test (Both Models)

## Parent PRD

`issues/prd.md`

## What is missing

Issue 006 specified a three-step startup check: (1) reachability, (2) model availability, and (3) a smoke test — sending a trivial JSON prompt to each model and verifying the response parses to `{ok: true}`. Steps 1 and 2 are implemented in `src/ollama-setup.ts` and `src/ollama-client.ts`, but step 3 (the smoke test) was never added.

The `runOllamaSetup()` function returns `{ ok: true }` after confirming the models are listed, without ever actually calling them.

## PRD requirement

From the PRD, LLM configuration section:

> On startup, the engine detects whether Ollama is reachable at `http://localhost:11434` and whether both configured model tags are pulled. If either check fails, a setup screen is shown with remediation actions.

From issue 006 acceptance criteria:

> Smoke test runs automatically after detection + model checks pass; success message confirms both models work; failure surfaces a specific error and a Retry button.
> Smoke test exchanges (request + response) are logged to the session log as `llm.call` events.

## What to implement

Extend `runOllamaSetup()` to accept an optional third injectable dependency `callModel: (tag: string, prompt: string, jsonMode: boolean) => Promise<string>`. Add a step 3:

- For each required model tag, call `callModel(tag, 'Respond with exactly the JSON object {"ok": true}.', true)`.
- Parse the response and verify it is an object with `ok === true`.
- Wrap in the `JsonRetryRunner` (3 attempts) — or at minimum catch parse errors and retry once.
- If the call fails or returns the wrong shape, return `{ ok: false, error: '...', phase: 'smoke_test' }`.

Extend `OllamaSetupResult` phase type to include `'smoke_test'`.

In `main.ts`, pass `callModel` into `runOllamaSetup` and log each smoke-test exchange via `activeLogger` (if open).

In `renderer.ts`, handle `phase: 'smoke_test'` the same way as `phase: 'models'` (show error + Retry button).

## Acceptance criteria

- [ ] After models are confirmed present, a smoke-test prompt is sent to each model.
- [ ] A successful smoke test (both models return valid JSON with `ok: true`) proceeds to the game/world picker.
- [ ] A failing smoke test (model returns invalid JSON after retries) shows the setup screen with a specific error message naming the failing model and a Retry button.
- [ ] Smoke test calls appear as `llm.call` events in the session log.
- [ ] `runOllamaSetup` tests cover the smoke-test failure path.

## PRD user stories addressed

- User story 44 (detect Ollama running and models pulled, offer remediation)
- User story 43 (developer configurable models)
