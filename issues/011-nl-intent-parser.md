# 011 — Natural-Language Intent Parser (Light-Model Fallback)

## Parent PRD

`issues/prd.md`

## What to build

When the deterministic IntentParser falls through (no pattern matches), route the raw input through the light model via the OllamaClient.

The light-model prompt:

- System prompt: WORLD.md body (verbatim) + a role description ("You translate natural-language player input into a structured game command.") + the JSON schema for the response + a few-shot example or two.
- User prompt: the player's raw input.
- Response shape: `{ command: <one of: MOVE, LOOK, LOOK_AT, TAKE, DROP, ATTACK, INVENTORY, NONE>, direction?: <if MOVE>, target?: <if applicable>, instrument?: <if applicable> }`.
- `NONE` is returned when the input cannot be mapped to any command (the engine then returns the `intent_unparseable` refusal).

Wrap the call in the JsonRetryRunner (3 attempts max). On terminal failure, return the `intent_unparseable` refusal.

Chained-command rejection: if the model returns a response with multiple commands (e.g., an array, or a `command` value that lists multiple actions), the engine returns a specific refusal: `"Please do one thing at a time."` (a new refusal key, e.g., `chained_command_rejected`, with a hardcoded default).

The `instrument` field is preserved on the parsed Intent and recorded in the session log, but combat still uses the auto-equipped weapon (slice 010 behavior unchanged).

After the LLM returns an Intent, the engine resolves any `target` string through the existing TargetResolver and proceeds with normal handling. If the target resolution is ambiguous, the disambiguation flow from slice 008 kicks in.

Session log captures `input.raw`, `input.parsed` (with a flag indicating deterministic vs LLM path), and the underlying `llm.call` for LLM-path inputs.

See PRD sections: Intent parsing, Target resolution, JSON retry and fallback.

## Acceptance criteria

- [ ] Natural-language commands like `"smack the goblin with my torch"`, `"grab the lantern"`, `"head back the way I came"`, `"examine the altar carefully"` are parsed to valid Intents and resolved by the engine.
- [ ] Inputs that the deterministic parser already handles (e.g., `n`, `take lantern`) do NOT trigger the LLM call (verified by absence of `llm.call` events for those inputs).
- [ ] Inputs with no valid mapping (e.g., `"asdfghjkl"`) return `intent_unparseable` after the LLM returns `command: NONE` or after retries exhaust.
- [ ] Multi-action inputs (e.g., `"take the lantern and head north"`) return the chained-command refusal.
- [ ] Target resolution from LLM-supplied target strings goes through the same TargetResolver as deterministic-path targets (verified by parity of behavior for ambiguous targets).
- [ ] `instrument` is logged in `input.parsed` events but does not change combat behavior in v1.
- [ ] Session log shows the path taken (deterministic vs LLM) for every player input.

## Blocked by

- Blocked by `issues/010-monsters-combat-drops-respawn.md`

## User stories addressed

- User story 11
