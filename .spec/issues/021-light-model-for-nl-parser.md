# 021 — NL Intent Parser Uses Heavy Model Instead of Light Model

## Parent PRD

`issues/prd.md`

## What is broken

The PRD specifies two distinct Ollama models with different roles:

> Two configurable Ollama models: a **heavy model** for Room/Monster/Item generation, and a **light model** for intent parsing.

In `src/main.ts`, `getRealLLM()` always creates an LLM function backed by `appConfig.heavyModel`. This same function is passed to `handleSubmitInput` as the sole `llmFn`, where it is used for **both** room generation **and** the NL intent-parsing fallback (`parseIntentWithNl`).

```ts
// src/main.ts, line 36-42
function getRealLLM() {
  return createRealLLM(
    appConfig.heavyModel,  // ← heavy model used for everything
    callModel,
    activeLogger ?? undefined,
  );
}
```

The `appConfig.lightModel` field is loaded, validated in Ollama setup, and exposed in `getConfig` — but it is never actually used to make LLM calls. Every NL-parsed command (user story 11: "smack the goblin with my torch") uses the slow, resource-heavy model instead of the light one intended for fast intent classification.

## What to fix

1. In `src/main.ts`, add a `getLightLLM()` function alongside `getRealLLM()` that uses `appConfig.lightModel`.
2. Thread `getLightLLM()` into `handleSubmitInput` as a new, separate parameter (or refactor the function signature so that `llmFn` is split into `generationLlmFn` and `parserLlmFn`).
3. In `src/main-handler.ts`, use the parser LLM for `parseIntentWithNl` and the generation LLM for `worldDB.movePlayer`.
4. Update the `handleSubmitInput` signature and all call sites (including tests) accordingly.

## Acceptance criteria

- [ ] NL intent parsing calls `appConfig.lightModel` (verified via `activeLogger` `llm.call` events — model field should show the light model tag).
- [ ] Room generation still uses `appConfig.heavyModel`.
- [ ] `getRealLLM()` / `getLightLLM()` both respect live changes to `appConfig` (they are re-created per call as `getRealLLM` currently does).
- [ ] Integration test updated to inject two separate mock LLM functions and confirm the correct one is called for intent vs generation.

## PRD user stories addressed

- User story 11 (natural-language commands)
- User story 43 (configurable heavy model and light model)
- User story 32 (input box locked during generation — light model should make NL parsing fast)
