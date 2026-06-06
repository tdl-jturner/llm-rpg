const DEFAULTS: Record<string, string> = {
  no_exit: "You can't go that way.",
  intent_unparseable: "I don't understand that.",
  nothing_here_named: "You don't see anything like that here.",
  cannot_take_scenery: "That's not something you can take.",
  ambiguous_target: "Which one do you mean?",
  already_have: "You already have that.",
  cant_drop_what_you_dont_have: "You don't have that.",
  inventory_empty: "You aren't carrying anything.",
};

export function getRefusal(key: string): string {
  return DEFAULTS[key] ?? `(Unknown refusal: ${key})`;
}
