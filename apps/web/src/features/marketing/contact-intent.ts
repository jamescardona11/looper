export type ContactIntent = "purchase";

export function resolveContactIntent(value: unknown): ContactIntent | undefined {
  return value === "purchase" ? value : undefined;
}
