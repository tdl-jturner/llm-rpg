# 025 — Disambiguation State Not Cleared on World Switch or World Load

## Parent PRD

`issues/prd.md`

## What is broken

`disambiguationState` in `src/main-handler.ts` is a module-level variable:

```ts
// main-handler.ts, line 37
let disambiguationState: DisambiguationState | null = null;
```

It is cleared after each resolution attempt, but it is **never cleared when a different world is loaded**. The `resetDisambiguationState()` function is exported for tests (`main-handler.integration.test.ts` calls it in `beforeEach`) but is never called in production code (`main.ts`).

**Scenario that breaks:** 

1. Player is in World A and types `take goblin` in a room with two goblins → disambiguation state is set with candidates from World A.
2. Player clicks `[worlds]` (back-to-picker), picks World B, and enters it.
3. The first input in World B is interpreted as a disambiguation answer against World A's candidates (entities from a different world / different entity IDs).
4. If the input happens to match a candidate name, `resolveEntityIntentAsync` is called with a stale `pendingIntent` and stale `Entity.id` — these IDs may not exist in World B's database, leading to a silent no-op or, in the worst case, operating on the wrong entity.

The same issue applies to `start-over-world`: after a start-over, the new game begins with fresh entity IDs but the old disambiguation state could reference entities from the erased database.

## What to fix

In `src/main.ts`, import and call `resetDisambiguationState` at every world transition:

1. Add `import { handleSubmitInput, buildHudData, resetDisambiguationState } from './main-handler';`  
   (the import already has `handleSubmitInput` and `buildHudData`).
2. Call `resetDisambiguationState()` in:
   - `open-world-file-picker` handler, before opening the new world DB.
   - `continue-world` handler, before opening the world DB.
   - `start-over-world` handler, after closing the DB.
   - `delete-world` handler, after closing the DB.

## Acceptance criteria

- [ ] After continuing to a different world mid-disambiguation, the first input in the new world is treated as fresh input (not a disambiguation answer).
- [ ] After `start-over`, the disambiguation state is cleared.
- [ ] Unit test or integration test verifies that switching worlds clears stale disambiguation.

## PRD user stories addressed

- User story 10 (rooms persistent — world state consistent across sessions)
- User story 33 (confirmation modal before start-over, then clean state)
