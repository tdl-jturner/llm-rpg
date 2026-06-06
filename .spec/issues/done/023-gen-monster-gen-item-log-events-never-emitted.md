# 023 — gen.monster and gen.item Log Events Are Never Emitted

## Parent PRD

`issues/prd.md`

## What is broken

The PRD Logging section requires:

> Event types logged: `llm.call`, `input.raw`, `input.parsed`, `state.mutate`, `refusal`, **`gen.room`**, **`gen.monster`**, **`gen.item`**, `error`, `session.start`, `session.end`.

`EventLogger` implements `logGenMonster()` and `logGenItem()` — both are tested in `event-logger.test.ts` and mocked in `main-handler.test.ts`. But they are **never called** anywhere in the production code.

In `src/world-db.ts`, the `commitTx` transaction inside `movePlayer` inserts generated monsters and items into the database but emits no `gen.monster` or `gen.item` log events:

```ts
// world-db.ts ~ line 787–819
if (roomToCommit.monsters && roomToCommit.monsters.length > 0) {
  // ... inserts to DB ...
  // ← no logGenMonster() call
}
if (roomToCommit.items && roomToCommit.items.length > 0) {
  // ... inserts to DB ...
  // ← no logGenItem() call
}
```

The `logger` parameter is already threaded into `movePlayer` — it just isn't used for these two event types.

## What to fix

In `src/world-db.ts`, after the `commitTx` transaction completes (around line 828, after `const newRoomId = commitTx() as number`):

1. If `roomToCommit.monsters` has entries, call:
   ```ts
   logger?.logGenMonster({ room_id: newRoomId, count: roomToCommit.monsters.length });
   ```
2. If `roomToCommit.items` has entries, call:
   ```ts
   logger?.logGenItem({ room_id: newRoomId, count: roomToCommit.items.length });
   ```

These should only fire when generation actually produced content (i.e., not when using the LIMINAL_GAP_ROOM fallback, which has empty arrays).

## Acceptance criteria

- [ ] After moving into a newly generated room that has a monster, the session JSONL log contains a `gen.monster` event with the correct `room_id` and `count`.
- [ ] After moving into a newly generated room that has items, the session log contains a `gen.item` event.
- [ ] Rooms with no monsters/items produce no `gen.monster`/`gen.item` events.
- [ ] The LIMINAL_GAP_ROOM fallback (empty arrays) does not produce these events.
- [ ] Integration test added to `main-handler.integration.test.ts` confirming `gen.monster` appears in the log after generating a room with a monster.

## PRD user stories addressed

- User story 46 (session-scoped JSONL event log capturing generation events)
