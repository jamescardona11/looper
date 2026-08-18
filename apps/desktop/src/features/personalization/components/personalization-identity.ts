function generatedUuid() {
  const generator = globalThis.crypto?.randomUUID;
  return typeof generator === "function"
    ? generator.call(globalThis.crypto)
    : null;
}

export function createId() {
  return (
    generatedUuid() ??
    `mode-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function getInitials(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const initials =
    words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`;
  return initials.toUpperCase();
}
