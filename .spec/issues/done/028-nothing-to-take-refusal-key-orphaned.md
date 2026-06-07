# 028 — nothing_to_take Refusal Key Is in VALID_KEYS but Has No Default and Is Never Used

## Parent PRD

`issues/prd.md`

## What is broken

In `src/refusal-bank.ts`:

```ts
const VALID_KEYS = new Set([
  'no_exit',
  'nothing_to_take',     // ← in VALID_KEYS
  'nothing_here_named',
  ...
]);

const DEFAULTS: Record<string, string> = {
  no_exit: "You can't go that way.",
  // nothing_to_take ← MISSING from DEFAULTS
  ...
};
```

`nothing_to_take` exists in `VALID_KEYS` (so a world author who puts it in their WORLD.md `refusals:` block will not see an "unknown key" warning), but has no default value. If `getRefusal('nothing_to_take')` were ever called, it would return the sentinel `"(Unknown refusal: nothing_to_take)"` — broken player-facing text.

Additionally, `nothing_to_take` is **never actually called** anywhere in the codebase. The TAKE path in `main-handler.ts` uses `nothing_here_named` for unknown targets — which is semantically appropriate. But the PRD's refusal taxonomy names both keys:

> `no_exit`, `nothing_to_take`, `nothing_here_named`, `nothing_to_attack`, `inventory_empty`, `cannot_take_scenery`, `cant_drop_what_you_dont_have`, `intent_unparseable`, `generation_failed`

One reasonable interpretation: `nothing_here_named` covers the "can't find that entity" case (for look_at, take, and attack equally), while `nothing_to_take` would cover a case like TAKE with no target at all ("take" with nothing following). The deterministic parser does not match bare "take" (no target), so this falls to `unknown` / `intent_unparseable`. The key is therefore ambiguous.

## What to fix

Two options — pick the simpler one:

**Option A (recommended):** Remove `nothing_to_take` from `VALID_KEYS` since it has no implementation and the existing `nothing_here_named` covers the same scenario. Add a comment explaining why it was removed. This prevents world authors from "overriding" a key that does nothing.

**Option B:** Give `nothing_to_take` a default in `DEFAULTS`, and use it specifically when the player types bare `take` with no target (currently falls through to `intent_unparseable`). This adds a slightly better error message for bare "take". The deterministic parser would need a new pattern match for bare `take`.

If Option A: also add a unit test confirming that `nothing_to_take` is no longer in `VALID_KEYS` (prevents regression).

If Option B: also add the bare-`take` pattern to `intent-parser.ts` returning `{ type: 'take', target: '' }`, and handle the empty-target case in `main-handler.ts` with `nothing_to_take`.

## Acceptance criteria

**Option A:**
- [ ] `nothing_to_take` removed from `VALID_KEYS`.
- [ ] World author with `refusals: { nothing_to_take: "..." }` in WORLD.md sees an "unknown refusal key" warning in the session log.
- [ ] Unit test confirms the key is no longer considered valid.

**Option B:**
- [ ] `nothing_to_take` has a default in `DEFAULTS`: `"There's nothing here to take."` (or similar).
- [ ] Bare `take` (no target) returns the `nothing_to_take` refusal rather than `intent_unparseable`.
- [ ] World author can override `nothing_to_take` in WORLD.md.

## PRD user stories addressed

- User story 35 (refusal messages optionally themed to the world)
- User story 41 (world author optionally overrides refusal messages)
- User story 45 (documented fallback per skill)
