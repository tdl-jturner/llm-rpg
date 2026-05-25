# 010 — Monsters + Combat + Balance + Drops + Death/Respawn

## Parent PRD

`issues/prd.md`

## What to build

Extend the Room Generation Skill's JSON schema to optionally include a `monsters` array (0 or 1 entry per room). Each monster object has `name`, `inspection_description`, `room_blurb`, `hp`, `damage_min`, `damage_max`, and a nested `drop` (a single weapon item with `name`, `inspection_description`, `room_blurb` written for the post-death "lying where the X fell" state, `damage_min`, `damage_max`).

Build the BalanceCalculator deep module: takes the player's currently equipped weapon (or fist 1–2 if unarmed) and returns target HP/damage bounds for a new monster. Formula: `monster_hp_min = round(avg_player_damage × 5)`, `monster_hp_max = round(avg_player_damage × 10)`. Monster damage bounds calibrated so that `monster_avg_damage × [5, 10] ≈ player_max_hp` (i.e., monster damage roughly such that the player would die in 5–10 hits from full HP). The drop weapon's damage bounds are computed similarly to other items — modest variety around the current weapon's average damage.

The Room Generation prompt now includes these bounds in the user prompt. The JSON schema enforces that returned monster `hp`, monster damage, and drop damage all fall within the bounds; out-of-range values trigger a JsonRetryRunner retry with structured feedback.

Persist monsters to the `monsters` table on room commit with `location = "room:<room_id>"`, `hp = max_hp = <generated value>`. Persist each monster's drop to the `items` table with `location = "monster:<monster_id>"`, `disturbed = false`.

Extend BlurbAssembler: monster's `room_blurb` appears in LOOK output between items and scenery (or wherever reads best) while the monster is alive in the room. Drop items with `location = "monster:<id>"` do NOT appear in LOOK output (they're held by the monster).

Build the CombatResolver deep module:

- Inputs: player (with HP, max HP, equipped weapon), monster.
- Behavior: one exchange. Roll player damage uniformly between `weapon.damage_min` and `weapon.damage_max` (or fist 1–2 if unarmed); subtract from monster HP. If monster dies, return `{monster_dead: true, player_damage_dealt, monster_damage_dealt: 0, player_died: false}`. Otherwise roll monster damage and subtract from player HP. Return `{monster_dead: false, player_damage_dealt, monster_damage_dealt, player_died: <true if player HP <= 0>}`.
- Pure function: no DB writes, no side effects. The caller applies the deltas.

Extend the deterministic IntentParser with `ATTACK <target>`, `FIGHT <target>`, `HIT <target>`, `KILL <target>`. Bare `ATTACK` with no target attacks the lone monster if exactly one is present; with no monster present, returns `nothing_to_attack`.

Combat flow per command:

- On `ATTACK <monster>`: run CombatResolver, apply deltas, render a two-line narrative (one for player's hit, one for monster's retaliation if any). Mark the monster as "engaged with the player" (a field on the monster row).
- On any command while engaged monsters are present in the room: after the command resolves, the engaged monster takes a retaliation roll against the player. This applies to `MOVE` too — movement succeeds, but the parting hit lands.
- On monster death: remove the monster from the room (set `location` to `"graveyard:<id>"` or similar sentinel). Move its drop from `location = "monster:<id>"` to `location = "room:<room_id>"` — with `disturbed = false`, so the drop's authored "lying where the X fell" `room_blurb` plays. Render a death narrative.
- On player death (HP <= 0): respawn. Reset player position to `(0, 0, 0)` (starting room). Set player HP to `max_hp`. Keep inventory and equipped weapon as-is. Iterate every monster ever engaged by this player (mark these somehow — e.g., an `engaged` flag) and refill their HP to `max_hp`; clear their engaged flag. Render a death + respawn narrative (e.g., `"Everything goes black. You wake at the threshold."`).
- All dropped items in the world stay where they are on player death.

See PRD sections: Combat and player state, Items and scenery (location semantics), Room Generation Skill, Intent parsing.

## Acceptance criteria

- [ ] Generated rooms sometimes contain a monster; its authored `room_blurb` appears in LOOK while it's alive.
- [ ] Drop items are NOT visible in the room while their monster is alive.
- [ ] `ATTACK <monster>` resolves one exchange via CombatResolver; HP and damage values fall within the documented bounds.
- [ ] Movement out of an engaged-monster room succeeds but takes a parting hit (verified by player HP delta).
- [ ] Monster death: monster's blurb stops appearing; drop item's authored `room_blurb` now appears.
- [ ] Player death: respawn at starting room, full HP, inventory preserved, dropped items still where they were, every engaged monster's HP refilled.
- [ ] Combat against unarmed (no equipped weapon) uses fist damage 1–2 and generates monsters with proportionally tiny stats (5–20 HP).
- [ ] Picking up a stronger weapon mid-game changes the difficulty of subsequently-generated monsters (verified by sampling the HP/damage of new monsters).
- [ ] LLM-generated monster stats that fall outside bounds trigger retry with structured feedback (verified by inducing a failure with a model that returns extreme numbers, or by testing the JsonRetryRunner with scripted out-of-bounds output).
- [ ] Unit tests for CombatResolver: damage roll within bounds, monster-dies path, player-dies path, both-survive path, edge cases (zero damage rolls if the weapon allows it, exactly-lethal hits).
- [ ] Unit tests for BalanceCalculator: bounds for a range of weapon average damages, including fist (1.5), small weapon, large weapon.

## Blocked by

- Blocked by `issues/009-items-take-drop-inventory.md`

## User stories addressed

- User story 13
- User story 14
- User story 17
- User story 18
- User story 19
- User story 20
- User story 25 (monsters)
- User story 27 (monsters)
- User story 28 (monsters)
