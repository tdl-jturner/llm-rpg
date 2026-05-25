# 005 — Loop Closure (Existing-Room Linking)

## Parent PRD

`issues/prd.md`

## What to build

Before invoking the generation pipeline on an unmapped exit, the engine checks whether the target `(x, y, z)` coordinate is already occupied by an existing room. If yes: skip generation entirely, create an entry in the `exits` table linking the current room to the existing room in the traveled direction, and (if the existing room does not already have a reciprocal back-exit pointing to the current room) retro-add it. If no: proceed with generation as before.

Player walking a closed path (`n e s w` or any cycle) arrives back at the originating room rather than generating a new room at the closure point.

This slice can be implemented and tested against the deterministic stub from slice 004 — the loop-closure logic is independent of whether the generator is stub or real.

See PRD sections: World topology and generation (specifically "Loop closure").

## Acceptance criteria

- [ ] Walking `n e s w` from the starting room (assuming the starting room declares N and E exits, and the generated rooms preserve E/S and S/W respectively) arrives back at the starting room — no new room is generated at the closure point.
- [ ] No duplicate exits are created when retro-adding a back-exit.
- [ ] The session log records a `gen.room` event with `source: "linked"` (or equivalent marker) when an existing room is linked instead of generated.
- [ ] Unit tests for GridTopology cover: coord-occupied lookup, reciprocal-direction lookup, retro-add-back-exit logic, no-op when back-exit already exists.

## Blocked by

- Blocked by `issues/004-generation-plumbing-stub.md`

## User stories addressed

- User story 9
