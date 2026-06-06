# 030 — Room Generation Schema Does Not Reject Invalid Exit Direction Strings

## Parent PRD

`issues/prd.md`

## What is broken

The PRD states:

> Cardinal exits only: `N`, `S`, `E`, `W`, `U`, `D`. No non-cardinal exits in v1.

The `ROOM_SCHEMA` in `src/room-generator.ts` validates the `exits` field as:

```ts
exits: { type: 'array', items: { type: 'string' } },
```

This only checks that exits are strings. An LLM could return `["north", "northeast", "through the archway"]` and the schema validator in `json-retry-runner.ts` would accept it without triggering a retry.

The post-validation filter in `generateRoom` silently drops invalid exits:

```ts
// room-generator.ts, line 432
const filtered = result.value.exits.filter((e) => allowableExits.includes(e));
```

This filtering prevents invalid exits from being persisted — so the world is not corrupted. But it means:
1. The LLM is not corrected via retry; it may consistently return non-cardinal exits and waste the full 3-attempt budget.
2. The generated room's exit list could be silently narrowed to zero, producing an isolated room with no forward exits (only the back-exit).

The PRD intent is clear: an invalid exit direction string is a schema violation that should trigger a retry with feedback, not a silent truncation.

## What to fix

Use the `validate` hook from issue 024 (or implement the validation inline in `generateRoom`):

After schema validation succeeds, check that every string in `result.value.exits` is a member of `allowableExits`. If any exit is outside that set, return a descriptive error string that becomes the retry feedback:

```ts
const invalidExits = result.value.exits.filter((e) => !allowableExits.includes(e));
if (invalidExits.length > 0) {
  return `exits contains invalid direction(s): ${invalidExits.join(', ')}. ` +
    `Only these directions are allowed: ${allowableExits.join(', ')}.`;
}
```

This is a separate concern from issue 024 (numeric bounds) and can be implemented independently even if 024 is not done yet (it can live as a post-schema check directly in `generateRoom`).

## Acceptance criteria

- [ ] If the LLM returns an exit that is not in `allowableExits`, the response is treated as a validation failure and a retry is issued.
- [ ] The retry prompt includes a description of which exit(s) were invalid and what the allowed set is.
- [ ] After 3 failed attempts, the LIMINAL_GAP_ROOM fallback is used (existing behavior — no change needed here).
- [ ] Unit test for `generateRoom`: a mock LLM that returns an invalid exit on the first attempt and a valid room on the second should produce a successful result, and the mock should have been called twice.
- [ ] Unit test for `generateRoom`: a mock LLM that always returns invalid exits exhausts all retries and returns `{ ok: false }`.

## PRD user stories addressed

- User story 9 (walk in a square and return to starting room — requires correct exit topology)
- User story 45 (LLM outputs strictly JSON-schema validated with up to 3 retries)
- User story 49 (pure-function modules testable in isolation)
