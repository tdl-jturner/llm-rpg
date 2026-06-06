# 013 — UI Polish: HUD, Command History, Color Palette

## Parent PRD

`issues/prd.md`

## What to build

Final renderer polish.

**Persistent HUD:** A thin strip at the top of the window (approximately 32px tall) shows:

`HP: <hp>/<max_hp>  ·  Wielding: <equipped weapon name and damage range, or "fists (1–2)" if unarmed>  ·  <current room name>`

The HUD updates after every turn (every IPC response from main). Each IPC response from main is extended to include a `hud: { hp, max_hp, weapon: {name, damage_min, damage_max} | null, room_name }` field; the renderer rebinds the HUD from this on every update.

**Command history:** Up- and down-arrow keys cycle through previously-submitted inputs in the current session. History is in-memory only (not persisted across world-load or app restart). Bounded to the last 100 inputs to prevent memory growth in extreme cases.

**Color palette:** Apply exactly four color roles using CSS variables (so the palette can be swapped in one place):

- Player input (the echoed `> <command>` line)
- Narrative text (room descriptions, blurbs, prose responses)
- System messages (e.g., "You take the lantern.", "(World generation hiccup logged.)")
- Damage/death events (combat hits, kills, respawn)

Pick a single cohesive palette. Monospace font is finalized (e.g., JetBrains Mono or IBM Plex Mono, bundled with the app to avoid OS-dependent rendering).

**Spinner refinement:** The input-area spinner introduced in slice 004 is restyled to fit the final palette.

**Scrollback retention:** In-session scrollback is unbounded for the player's reading; only the most recent ~100 lines are sent back to the LLM as conversational context in any prompt that includes player history (note: in v1, no skill currently includes player history in its prompt, so this is a forward-looking constraint and lands as a no-op).

See PRD sections: UI shell (renderer).

## Acceptance criteria

- [ ] HUD strip is always visible above the scrollback, with HP / weapon / room name updating after every turn.
- [ ] HP shows correctly for unarmed, equipped, and during combat (visible damage updates).
- [ ] Room name updates immediately on entering a new room.
- [ ] Up-arrow at the empty input box recalls the last command; subsequent up-arrows cycle further back; down-arrow cycles forward; reaching past the most-recent returns to empty input.
- [ ] Color palette is applied via CSS variables; swapping the palette in one place updates all four roles.
- [ ] Player input lines render in the player-input color; narrative in narrative color; system messages in system color; combat events in damage color.
- [ ] Monospace font renders identically on macOS, Windows, and Linux (bundled font, not system-dependent).
- [ ] Spinner styling matches the final palette.
- [ ] No regression in input-lock-during-generation behavior from slice 004.

## Blocked by

- Blocked by `issues/010-monsters-combat-drops-respawn.md`

## User stories addressed

- User story 30
- User story 31
