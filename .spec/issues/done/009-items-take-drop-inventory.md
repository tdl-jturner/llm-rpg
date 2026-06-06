# 009 — Items + TAKE + DROP + INVENTORY + Auto-Equip + Disturbed-Blurb Rule

## Parent PRD

`issues/prd.md`

## What to build

Extend the Room Generation Skill's JSON schema to require an `items` array (0–3 weapon objects per room, each with `name`, `inspection_description`, `room_blurb`, `damage_min`, `damage_max`, `type: "weapon"`). Persist each item to the `items` table on room commit with `location = "room:<room_id>"`, `disturbed = false`.

Extend BlurbAssembler to append each present item's blurb after `fixed_description` and before scenery:

- If `disturbed = false`: use the item's authored `room_blurb`.
- If `disturbed = true`: use a deterministic template (e.g., `"A {item.name} lies on the floor here."`).

Extend the deterministic IntentParser and TargetResolver scope:

- `TAKE <item-in-room>`: moves the item to `location = "player_inventory"`, flips `disturbed = true` permanently. Auto-equip rule: if the player's currently equipped weapon has lower average damage (or is null = fist 1–2) than the taken item, set `equipped_weapon_id` to the new item. Echo a short confirmation: `"You take the {item.name}."` (and `" You wield it."` if auto-equipped).
- `TAKE <scenery name>`: still returns `cannot_take_scenery` (slice 008 behavior).
- `TAKE <inventory item>`: returns a refusal (`"You already have the {item.name}."`).
- `TAKE <unknown noun>`: returns `nothing_here_named`.
- `DROP <inventory item>`: moves the item to `location = "room:<current_room_id>"` (`disturbed` stays `true`, since the item was previously taken). If the dropped item was the equipped weapon, re-run the auto-equip selection against the remaining inventory; equip the strongest remaining weapon (or `null` if inventory is empty).
- `DROP <not-in-inventory>`: returns `cant_drop_what_you_dont_have`.
- `INVENTORY`, `I`, `INV`: render the player's inventory as a list of item names, marking the equipped item (e.g., `"a notched scimitar (equipped)"`). If empty, return `inventory_empty`.
- `LOOK AT <inventory item>`: returns the item's `inspection_description`.

Auto-equip implementation: a single helper that takes the player's inventory and the currently equipped weapon and returns the weapon (or null) that should be equipped — the one with the highest average damage. Invoked after every TAKE and after every DROP of the currently-equipped weapon.

See PRD sections: Items and scenery, LOOK assembly, Combat and player state (auto-equip rule), Intent parsing.

## Acceptance criteria

- [ ] Generated rooms contain 0–3 items; their authored `room_blurb`s appear in LOOK output until taken.
- [ ] `TAKE <item>` moves the item to inventory, flips `disturbed`, and (if applicable) auto-equips it. The item disappears from the room's LOOK output.
- [ ] Dropping the item elsewhere makes it appear in that room's LOOK output via the deterministic template, not the authored `room_blurb`.
- [ ] Dropping the item back in its original room still uses the template (because `disturbed = true`).
- [ ] `INVENTORY` shows the full list with the equipped marker.
- [ ] `LOOK AT <inventory item>` and `LOOK AT <room item>` both work.
- [ ] Dropping the currently-equipped weapon triggers re-selection of the next-best weapon; if inventory is empty, `equipped_weapon_id` becomes `null` (unarmed).
- [ ] Picking up a weaker weapon than currently equipped does NOT change the equipped weapon.
- [ ] All TAKE / DROP / equip changes are persisted immediately (quit + relaunch shows correct state).
- [ ] Unit tests for BlurbAssembler with mixed `disturbed` flags; for the auto-equip helper across edge cases (empty inventory, ties on average damage, fist vs weapon comparison).

## Blocked by

- Blocked by `issues/008-scenery-look-at.md`

## User stories addressed

- User story 15
- User story 16
- User story 21
- User story 22
- User story 23
- User story 24
- User story 25 (items)
- User story 27 (items)
- User story 28 (items)
