# 018 — Fix cannot_take_scenery Refusal: Override Not Applied, Event Not Logged

## Parent PRD

`issues/prd.md`

## What is broken

In `src/main-handler.ts`, the `take` case handles scenery like this:

```ts
if (entity.kind === 'scenery') {
  narrative.push(entity.roomBlurb || emitRefusal('cannot_take_scenery', logger, refusals));
}
```

Because generated scenery always has a non-empty `room_blurb`, the `entity.roomBlurb` branch is always taken. This means:

1. The `emitRefusal` call is never reached, so no `refusal` log event is emitted for `cannot_take_scenery`.
2. Any WORLD.md override for `cannot_take_scenery` is silently ignored — the authored scenery `room_blurb` is always shown regardless of the override.

The same bug exists in `resolveEntityIntentAsync` (the disambiguation path) where the same pattern is used.

## PRD requirement

From the PRD, Refusal voice section:

> `cannot_take_scenery` default behavior is to return the targeted scenery's `room_blurb`; the override key can replace this with a generic refusal.

So the logic should be:
- If a `cannot_take_scenery` override exists in WORLD.md, use the override string (not the scenery's `room_blurb`).
- If no override exists, use the scenery's `room_blurb` as the response body — but still emit a `refusal` log event with `overridden: false`.

## What to fix

In `main-handler.ts`, change the scenery-take path to:

```ts
if (entity.kind === 'scenery') {
  // Check if there is a WORLD.md override for this key
  const override = refusals?.['cannot_take_scenery'];
  if (override) {
    narrative.push(emitRefusal('cannot_take_scenery', logger, refusals));
  } else {
    // Default: show the scenery's room_blurb, but still log the refusal event
    const message = entity.roomBlurb || _getRefusal('cannot_take_scenery');
    logger?.logRefusal({ key: 'cannot_take_scenery', message, overridden: false });
    narrative.push(message);
  }
}
```

Apply the same fix in `resolveEntityIntentAsync`.

## Acceptance criteria

- [ ] Taking a scenery item with no WORLD.md override shows the scenery's `room_blurb` AND emits a `refusal` log event with `key: 'cannot_take_scenery'`, `overridden: false`.
- [ ] Taking a scenery item when WORLD.md has `refusals.cannot_take_scenery: "..."` shows the override string (not the `room_blurb`) AND emits a `refusal` event with `overridden: true`.
- [ ] Both paths (direct TAKE and post-disambiguation TAKE) behave identically.
- [ ] Unit test for the override-applied path.

## PRD user stories addressed

- User story 26 (take mentioned-but-decorative scenery returns in-world refusal)
- User story 41 (world author overrides refusal messages in WORLD.md)
- User story 46 (session log captures refusals)
