# 014 — Wire worldBody to NL Intent Parser at Runtime

## Parent PRD

`issues/prd.md`

## What is broken

The NL intent parser (issue 011) is implemented correctly but is silently disabled at runtime because `main.ts` passes `undefined` as the `worldBody` argument to `handleSubmitInput`.

In `src/main.ts`, line 145:

```ts
return handleSubmitInput(text, worldDB, getRealLLM(), activeLogger, undefined, activeRefusals);
```

The fifth argument (`worldBody`) is `undefined`. Inside `handleSubmitInput`, the NL fallback is gated on:

```ts
if (intent.type === 'unknown' && llmFn && worldBody) {
```

Since `worldBody` is always falsy, every unrecognised player command falls through to the `intent_unparseable` refusal instead of being routed to the light-model NL parser. User story 11 ("natural-language commands like 'smack the goblin with my torch'") is therefore completely broken in production.

## Root cause

`main.ts` never stores the loaded world's body text. It stores `activeRefusals` from `parsed.world.refusals` but discards `parsed.world.body`.

## What to fix

1. Add a module-level variable `let activeWorldBody: string | undefined` in `main.ts`.
2. In the `open-world-file-picker` and `continue-world` IPC handlers, after loading the world file, set `activeWorldBody = parsed.world.body` (or `world.body` in the create path).
3. Also reset `activeWorldBody = undefined` in the `start-over-world` and `delete-world` handlers alongside the existing `worldDB = undefined`.
4. Pass `activeWorldBody` instead of `undefined` as the fifth argument to `handleSubmitInput`.

PRD section: **Intent parsing** — "Stage 2 — LLM fallback. If no deterministic pattern matches, the input is sent to the light model with WORLD.md body in the system prompt."

## Acceptance criteria

- [ ] After the fix, typing an unrecognised natural-language command (e.g. "smack the goblin") triggers an `llm.call` log event in the session log.
- [ ] `activeWorldBody` is populated in both the create-new-world and continue-world flows.
- [ ] `activeWorldBody` is cleared on start-over and delete.
- [ ] The existing deterministic commands (`n`, `look`, `take X`, etc.) still resolve on the deterministic path (no `llm.call` for them).
- [ ] Unit / integration test in `main-handler.test.ts` updated to confirm `worldBody` is forwarded.

## PRD user stories addressed

- User story 11 (natural-language commands)
- User story 35 (themed refusals via NL context)
