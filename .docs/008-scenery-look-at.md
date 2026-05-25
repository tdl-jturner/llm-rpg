# 008 — Scenery Generation + LOOK AT + Scenery Refusal on TAKE

## Parent PRD

`issues/prd.md`

## What to build

Extend the Room Generation Skill's JSON schema to require a `scenery` array (0 or more objects, each with `name`, `inspection_description`, `room_blurb`). Persist each scenery item to the `scenery` table on room commit, linked to the room.

Extend BlurbAssembler to append every scenery item's `room_blurb` (in author-supplied order) after the room's `fixed_description` when assembling LOOK output. The scenery `room_blurb`s never disappear — scenery is permanent.

Build the TargetResolver deep module:

- Inputs: a target string from the parsed Intent and a scope (the set of in-scope entities: items in room, items in inventory, monsters in room, scenery in room — at this slice, only scenery is populated).
- Behavior: case-insensitive substring/prefix match against entity `name`s. Returns one of: unique match, ambiguous (with candidate list), no match.

Extend the deterministic IntentParser with two new patterns:

- `LOOK AT <target>`, `EXAMINE <target>`, `X <target>` → resolves target via TargetResolver and returns the matched entity's `inspection_description`.
- `TAKE <target>`, `GET <target>`, `GRAB <target>`, `PICK UP <target>` → resolves target via TargetResolver. If the match is scenery, return the `cannot_take_scenery` refusal whose default behavior is to display the matched scenery's `room_blurb`. (Other match types come in later slices.)

Unknown targets return the `nothing_here_named` refusal. Ambiguous matches return a disambiguation prompt ("Which one? a, b, or c?") and lock the input until the player picks. Disambiguation is a one-shot resolution: the next input is interpreted as picking from the candidate list; if that input doesn't match one of the candidates, the disambiguation is canceled and the input is treated as a fresh command.

See PRD sections: Room Generation Skill, LOOK assembly, Intent parsing, Target resolution, Refusal voice, Items and scenery.

## Acceptance criteria

- [ ] Generated rooms contain 0+ scenery items; their `room_blurb`s appear in LOOK output after `fixed_description`.
- [ ] `LOOK AT <scenery name>`, `EXAMINE <scenery name>`, `X <scenery name>` all return the scenery's `inspection_description`.
- [ ] `TAKE <scenery name>` returns the scenery's `room_blurb` (default `cannot_take_scenery` behavior).
- [ ] `LOOK AT <noun not in scope>` returns the `nothing_here_named` refusal.
- [ ] Ambiguous matches trigger disambiguation; picking a valid candidate resolves the original intent; an unrelated input cancels disambiguation.
- [ ] Unit tests for TargetResolver: unique match, ambiguous match (verify candidate list ordering), no match, case-insensitivity, prefix vs substring.
- [ ] Unit tests for BlurbAssembler: scenery `room_blurb`s appended in supplied order; no scenery = no extra output.
- [ ] Unit tests for IntentParser additions: each of the three look-at synonyms and four take synonyms; targets containing multiple words.

## Blocked by

- Blocked by `issues/007-room-gen-real-llm.md`

## User stories addressed

- User story 25 (scenery)
- User story 26
- User story 27 (scenery)
