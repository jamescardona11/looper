# 0003 — `apps/desktop/src/data/` owns Tauri command and event boundaries

## Status

Accepted. Describes a decision already implemented and enforced in CI.

## Context

Tauri command and event names are untyped runtime strings. If components call
`invoke()` or `listen()` directly, a Rust rename can fail in only one window at
runtime and the frontend dependency surface becomes difficult to audit.

## Decision

`src/data/` owns command names, event names, crossing types, and typed wrappers,
organized by domain. Components and feature hooks consume those wrappers.

The directory also contains desktop-only Convex orchestration allowed by ADR
0004. UI-level window and plugin APIs may use the existing app/shared boundary
modules; they do not move command or event strings back into features.

`apps/desktop/eslint.config.js` rejects direct `invoke` and `listen` imports
outside `src/data/**`. `pnpm --dir apps/desktop lint:ci`, `make lint-desktop`,
and `make ci` run this check.

## Consequences

**What follows from this**

- Rust command and event dependencies are discoverable under `src/data/`.
- Boundary modules are unit-testable by mocking `@tauri-apps/api`; tests remain
  co-located.
- Thin wrappers and long-running cloud orchestrators share the directory
  because both are frontend data boundaries, not presentation logic.
- The lint rule is intentionally narrower than a ban on every Tauri package.
  Expanding enforcement requires updating the rule and this ADR together.

**What this forbids**

- Importing `invoke` or `listen` outside `src/data/**`.
- Putting command or event strings outside their domain boundary.
- Creating a parallel services/API layer beside `src/data/`.
