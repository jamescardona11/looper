export type ActionCardAccent = {
  borderColor: string;
  backgroundColor: string;
};

const ACCENT_TOKENS = {
  interactive: ["var(--color-interactive-30)", "var(--color-interactive-10)"],
  cloud: ["var(--color-cloud-30)", "var(--color-cloud-10)"],
  local: ["var(--color-local-30)", "var(--color-local-10)"],
  accent: ["var(--color-accent-30)", "var(--color-accent-10)"],
  error: ["var(--color-danger-border)", "var(--surface-danger-subtle)"],
} as const;

export type ActionCardAccentPreset = keyof typeof ACCENT_TOKENS;

export function resolveActionCardAccent(
  preset: ActionCardAccentPreset = "interactive",
  overrides: Partial<ActionCardAccent> = {},
): ActionCardAccent {
  const [borderColor, backgroundColor] = ACCENT_TOKENS[preset];
  return {
    borderColor: overrides.borderColor ?? borderColor,
    backgroundColor: overrides.backgroundColor ?? backgroundColor,
  };
}
