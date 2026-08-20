# Agent Rules — packages

Shared packages are platform-agnostic. Global rules are in the root
`AGENTS.md`.

## Boundaries

- `@looper/data` is the Convex data layer for web and mobile: domain hooks,
  normalized types, auth, and provider mounting. Desktop headless orchestration
  is the documented exception in ADR 0004.
- `@looper/config` owns shared product configuration. Search for an existing
  owner before adding a constant, catalog, or feature flag; keep it free of
  server-only and platform-specific code.
- `@looper/i18n` owns Lingui catalogs. Keep every supported locale in exact key
  parity.
- Do not import React Native, Expo, DOM globals, or other platform-only modules
  into a cross-platform package.
- Outside `@looper/data`, do not import Convex client internals. Convex server
  code belongs in `backend/convex`.
