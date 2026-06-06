# 020 — Fix generation_failed Refusal Key: Add Default Message

## Parent PRD

`issues/prd.md`

## What is broken

The `VALID_KEYS` set in `src/refusal-bank.ts` includes `generation_failed`, and the PRD (Refusal voice section) lists it as a first-class refusal key. However, the `DEFAULTS` map in `refusal-bank.ts` has no entry for `generation_failed`.

When `getRefusal('generation_failed')` is called, the function falls through to:
```ts
return DEFAULTS[key] ?? `(Unknown refusal: ${key})`;
```
…and returns the raw sentinel string `"(Unknown refusal: generation_failed)"` to the player. This is a broken player-facing message.

Additionally, the `generation_failed` key is in `VALID_KEYS` but is never actually used in the codebase — the room-generation failure path in `main-handler.ts` shows `"(World generation hiccup logged.)"` as a hardcoded string rather than routing through `emitRefusal('generation_failed', ...)`. So the WORLD.md override for this key is also unreachable.

## What to fix

1. Add a `generation_failed` entry to `DEFAULTS` in `refusal-bank.ts`:
   ```ts
   generation_failed: "(World generation hiccup logged.)",
   ```

2. In `main-handler.ts`, replace the hardcoded `'(World generation hiccup logged.)'` string in the `move` case with `emitRefusal('generation_failed', logger, refusals)`. This makes the key:
   - Actually routed through the refusal system.
   - Overridable by WORLD.md `refusals.generation_failed`.
   - Logged as a `refusal` event.

## Acceptance criteria

- [ ] `getRefusal('generation_failed')` returns the default message (not the `(Unknown refusal: ...)` sentinel).
- [ ] When room generation fails (Liminal Gap fallback), the `generation_failed` refusal is emitted and logged as a `refusal` event.
- [ ] A WORLD.md with `refusals.generation_failed: "..."` shows the override in-game when a Liminal Gap is inserted.
- [ ] Existing unit tests for RefusalBank updated/extended to cover `generation_failed`.

## PRD user stories addressed

- User story 36 (small in-game indicator when world generation fails)
- User story 41 (world author optionally overrides refusal messages)
