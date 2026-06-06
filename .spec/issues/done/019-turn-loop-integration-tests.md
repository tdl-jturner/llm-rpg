# 019 — Integration Tests: Full Turn Loop Against Real DB + Mocked Ollama

## Parent PRD

`issues/prd.md`

## What is missing

The PRD Testing Decisions section explicitly requires:

> **Integration tests, against a mocked Ollama:**
> TurnLoop — end-to-end input-to-update flow for representative scenarios: move into existing room, move into unmapped exit (triggering room generation), TAKE a known item, TAKE an unknown noun, ATTACK with and without auto-equipped weapon, player death and respawn, monster death and drop placement.

Currently, `main-handler.test.ts` uses a stubbed `WorldDB` (all methods are `vi.fn()` mocks) rather than a real SQLite-backed `WorldDB`. This means the tests do not exercise:
- The `world-db.ts` → `migration-runner.ts` → `better-sqlite3` stack
- Correct persistence of items, monsters, and player state across a sequence of commands
- Auto-equip triggering correctly on TAKE
- Monster death moving the drop to the room
- Player respawn refilling engaged monsters and resetting position

## What to build

Create `src/main-handler.integration.test.ts` (or similar). The test setup:

1. Create an in-memory (or temp-file) SQLite database using `openWorldDB` with a minimal hand-crafted `WorldFile` (no LLM needed for the starting room).
2. Inject a `mockLlmFn` that returns canned room JSON for generation scenarios.
3. Call `handleSubmitInput` with the real `worldDB` and the mock LLM.

Scenarios to cover (each as a distinct `it` block):

- **Move into existing room**: seed two connected rooms; MOVE into the second; verify the room name in the narrative.
- **Move into unmapped exit (triggers generation)**: MOVE in a direction that is declared but has no wired exit; verify `mockLlmFn` is called and the generated room name appears in narrative.
- **Move triggers loop closure**: walk a square (`n`, `e`, `s`, `w`); verify player returns to starting room.
- **TAKE a known item**: create a room with an item; TAKE it; verify `getPlayerInventory()` contains it and the item is no longer in the room.
- **TAKE with auto-equip**: TAKE a better weapon; verify `getEquippedWeapon()` returns the new item; TAKE a weaker weapon; verify equipped weapon does not change.
- **TAKE an unknown noun**: returns `nothing_here_named` refusal.
- **DROP the equipped weapon**: verify equipped weapon is re-selected from remaining inventory.
- **ATTACK — monster survives**: verify player HP decreases and monster HP decreases.
- **ATTACK — monster dies**: verify monster location changes to `dead:<id>`, drop item appears in room.
- **ATTACK — player dies**: verify player HP resets to `max_hp`, position resets to starting room, engaged monsters are refilled.
- **Parting hit**: move out of room with an engaged monster; verify player takes damage before entering the new room.
- **INVENTORY when empty**: returns `inventory_empty` refusal.
- **INVENTORY with items**: shows list with equipped marker.

## Implementation notes

- Use Vitest for the test runner (consistent with other tests).
- `openWorldDB` accepts a `worldDir` path — use `os.tmpdir()` with a unique subdirectory per test suite, cleaned up in `afterAll`.
- Mock `LLMFunction` can be a simple `vi.fn()` that resolves with a valid canned room JSON.
- The test must pass `worldBody` (a non-empty string) to `handleSubmitInput` to enable the NL fallback path (though most tests use deterministic commands, the plumbing should be correct).

## Acceptance criteria

- [ ] All scenarios listed above are implemented as passing tests.
- [ ] Tests use a real SQLite `WorldDB` (not a mock) so the DB/migration layer is exercised.
- [ ] Mocked Ollama returns canned JSON; no real Ollama connection needed.
- [ ] Tests are deterministic and pass on CI without external services.

## PRD user stories addressed

- User story 50 (integration tests for turn loop against mocked Ollama)
