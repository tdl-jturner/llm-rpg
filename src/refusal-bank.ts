const DEFAULTS: Record<string, string> = {
  no_exit: "You can't go that way.",
  intent_unparseable: "I don't understand that.",
};

export function getRefusal(key: string): string {
  return DEFAULTS[key] ?? `(Unknown refusal: ${key})`;
}
