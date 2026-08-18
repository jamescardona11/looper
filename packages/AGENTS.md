# Agent Rules — packages/

Platform-agnostic code shared by the selected apps. Global rules: root
`AGENTS.md`.

## The cardinal rule: consume, don't duplicate
- `@looper/data` is the SINGLE source for the Convex data layer: domain
  hooks, normalized types, auth seam, and the Convex provider mount. Apps should
  prefer `@looper/data` or feature barrels.
- `@looper/config` — shared configuration for selected capabilities.
  `billing-config.ts` owns TIERS, price IDs, and `tierSatisfies`.
  `agent-config.ts` owns MODELS, SYSTEM_PROMPT, RATE_LIMITS, and TOOL_USE_ENABLED.
  Imported by backend AND clients — keep it free of server-only or DOM/RN code.
- `@looper/i18n` — Lingui. `en.ts` and `es.ts` MUST stay in 1:1 key parity
  (a test enforces it). Add a key to both.

## DON'T
- Don't import platform-specific modules (`react-native`, `expo-*`, DOM globals)
  in a shared package — it breaks the other platform's build.
- Don't pull Convex internals into shared packages. Convex client code belongs
  in `@looper/data`; server code belongs in `backend/convex`.
