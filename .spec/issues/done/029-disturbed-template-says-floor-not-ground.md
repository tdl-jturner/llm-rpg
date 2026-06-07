# 029 — Disturbed Item Template Uses "floor" Instead of PRD-Specified "ground"

## Parent PRD

`issues/prd.md`

## What is broken

The PRD specifies the deterministic template for a previously-disturbed item appearing in a room:

> Once `disturbed`, the LOOK output uses a deterministic template (e.g., `"A {name} lies on the ground here."`).

The current implementation in `src/blurb-assembler.ts` says `"floor"`:

```ts
// blurb-assembler.ts, line 47
parts.push(`A ${item.name} lies on the floor here.`);
```

The corresponding test in `src/blurb-assembler.test.ts` asserts the same incorrect text:

```ts
// blurb-assembler.test.ts, line 30
expect(result).toBe('A dim chamber.\nA rusty sword lies on the floor here.');
```

This is a minor but specific PRD deviation. "Ground" is semantically more appropriate for all settings (outdoor environments, caves, dungeons) whereas "floor" implies an indoor room. The PRD example deliberately uses "ground" to be setting-agnostic.

## What to fix

1. In `src/blurb-assembler.ts`, line 47, change `floor` to `ground`:
   ```ts
   parts.push(`A ${item.name} lies on the ground here.`);
   ```

2. Update the matching assertion in `src/blurb-assembler.test.ts` (line 30 and any other occurrences) to expect `"ground"`.

3. If the renderer's `classifyLine` function in `src/renderer.ts` has any hardcoded string matching against this template, update it as well (currently it does not match this pattern, so no change needed there).

## Acceptance criteria

- [ ] `assembleBlurb` for a disturbed item produces `"A <name> lies on the ground here."`.
- [ ] All `blurb-assembler` tests pass with the updated wording.
- [ ] No other files reference the old `"on the floor"` wording from this template.

## PRD user stories addressed

- User story 28 (item taken no longer appears in subsequent LOOKs — and when it is dropped, it shows the disturbed template)
- User story 23 (dropped item stays where left across sessions — and is described consistently)
