const VALID_KEYS = new Set([
  'no_exit',
  'nothing_to_take',
  'nothing_here_named',
  'nothing_to_attack',
  'inventory_empty',
  'cannot_take_scenery',
  'cant_drop_what_you_dont_have',
  'intent_unparseable',
  'generation_failed',
  'chained_command_rejected',
  'already_have',
]);

const DEFAULTS: Record<string, string> = {
  no_exit: "You can't go that way.",
  intent_unparseable: "I don't understand that.",
  nothing_here_named: "You don't see anything like that here.",
  cannot_take_scenery: "That's not something you can take.",
  ambiguous_target: "Which one do you mean?",
  already_have: "You already have that.",
  cant_drop_what_you_dont_have: "You don't have that.",
  inventory_empty: "You aren't carrying anything.",
  nothing_to_attack: "There's nothing here to fight.",
  chained_command_rejected: "Please do one thing at a time.",
};

export function getRefusal(key: string, overrides?: Record<string, string>): string {
  if (overrides && key in overrides) {
    return overrides[key];
  }
  return DEFAULTS[key] ?? `(Unknown refusal: ${key})`;
}

/**
 * Returns any keys in the provided refusals map that are not recognised valid
 * refusal keys. Used at world-load to warn about typos / unsupported keys.
 */
export function getUnknownRefusalKeys(refusals: Record<string, string>): string[] {
  return Object.keys(refusals).filter((k) => !VALID_KEYS.has(k));
}
