# 024 — LLM-Generated Monster Stats Not Validated Against Balance Bounds

## Parent PRD

`issues/prd.md`

## What is broken

The PRD states:

> Numeric stats for monsters and items must lie within engine-supplied bounds; out-of-range values are a validation failure and trigger retry.

The engine computes balance bounds (`computeMonsterBounds`) and passes them into the generation prompt — so the LLM is instructed to stay within range. However, the JSON schema validator in `json-retry-runner.ts` only validates structure (required fields and types). It never checks whether the numeric values lie within the supplied bounds.

If the LLM returns a monster with `hp: 1` when `hp_min` is 8 (because the player has a strong weapon), or a drop with `damage_max: 50` when `drop_damage_max` is 4, the value passes validation and is committed to the database. No retry occurs.

Relevant code in `src/room-generator.ts`: the `ROOM_SCHEMA` only declares `hp`, `damage_min`, `damage_max` as `{ type: 'number' }` — no `minimum`/`maximum` constraints.

The `generateRoom` function receives `context.monsterBounds` but never uses those values for post-generation validation:

```ts
// room-generator.ts, generateRoom()
const result: RetryResult<GeneratedRoom> = await runWithRetry<GeneratedRoom>({
  llmFn,
  schema: ROOM_SCHEMA,  // ← no bounds encoded
  prompt,
});
```

## What to fix

After `runWithRetry` succeeds in `generateRoom`, add a bounds-validation pass over the returned monster and item arrays. If any value is out of bounds, return `{ ok: false, error: '...' }` which will cause the caller (in `world-db.ts`) to fall back to the LIMINAL_GAP_ROOM — this is the safest recovery option since there is no retry at this layer.

Alternatively (better): encode `monsterBounds` into a custom post-schema validator passed to `runWithRetry` via a new optional `validate` hook, so that out-of-bounds values trigger a structured retry with feedback. This matches the PRD intent exactly.

**Recommended approach:**

1. Add an optional `validate?: (value: T) => string | null` field to `RunWithRetryOptions<T>` in `json-retry-runner.ts`. If provided, run it after schema validation on each attempt; a non-null return is treated as a validation error (appended to retry prompt).
2. In `generateRoom`, pass a `validate` function that checks monster `hp`, `damage_min`, `damage_max`, and drop `damage_min`/`damage_max` against `monsterBounds` when present.

## Acceptance criteria

- [ ] `runWithRetry` accepts an optional `validate` function and calls it after schema validation.
- [ ] When a monster's `hp` is outside `[hp_min, hp_max]`, the retry runner triggers a retry with the out-of-bounds error described.
- [ ] When a monster's `damage_min` or `damage_max` is outside the allowed range, same retry behavior.
- [ ] When a drop's `damage_min`/`damage_max` is outside bounds, same retry behavior.
- [ ] Unit test for `JsonRetryRunner` covers: success-on-retry when first response fails custom validate.
- [ ] Unit test for `generateRoom` confirms that an in-bounds monster passes, and an out-of-bounds monster is rejected and triggers the fallback.

## PRD user stories addressed

- User story 45 (LLM outputs strictly JSON-schema validated with up to 3 retries and documented fallback)
- User story 13–14 (combat balance — fights take 5–10 turns)
