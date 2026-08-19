# 0003 — `apps/desktop/src/data/` is the only place that talks to Tauri, one file per domain

## Status

Accepted. Describes a decision already implemented and enforced in CI.

## Context

Given ADR 0001 (Rust owns the business logic), every meaningful frontend
operation is an `invoke()` call or a `listen()` subscription. Left unmanaged,
those calls scatter: a component invokes a command inline, a hook subscribes to
an event, and the set of commands the frontend actually depends on becomes
impossible to enumerate. Renaming a Rust command then means grepping string
literals across the whole UI, and the failure mode is a runtime rejection in
one window, not a compile error.

The frontend also has no other way to reach the backend: there is no HTTP
server, no IPC other than Tauri's, and command names are untyped strings.

## Decision

`src/data/` is the single Tauri boundary. One file per domain; that file owns
the command names, the event names, and the TypeScript types crossing the
boundary for its domain, and exports typed functions. Everything else in the
frontend calls those functions.

Current shape: 39 non-test modules in `src/data/` (26 co-located `*.test.ts`), one per domain — `audio.ts`,
`dictation.ts`, `insertion.ts`, `settings.ts`, `shortcuts.ts`, `license.ts`,
`memory.ts`, `corrections.ts`, `personalization.ts`, `overlay.ts`, `toast.ts`,
`updates.ts`, `meeting-awareness.ts`, `live-meeting.ts`, `remote-dictation.ts`,
`convex-auth.ts`, the `*-sync.ts` workers, plus the `library/` and
`transcription/` sub-barrels.

**Compliance, measured.** Matching `\binvoke[<(]` across
`apps/desktop/src/` returns 121 hits: 120 under `src/data/`, and 1 in
`src/features/preview/pillPreviewBridge.ts` — which is a method named `invoke`
on a mock bridge object used by the browser preview, not a Tauri call. Counting
importers instead of call sites: exactly 30 files import `invoke` from
`@tauri-apps/api/core`, and all 30 are under `src/data/`. There are zero real
violations.

**The rule is enforced by tooling.** `apps/desktop/eslint.config.js` declares,
at `error` level with `src/data/**` ignored:

```
"no-restricted-syntax": ["error",
  { selector: "ImportDeclaration[source.value='@tauri-apps/api/core'] ImportSpecifier[imported.name='invoke']", … },
  { selector: "ImportDeclaration[source.value='@tauri-apps/api/event'] ImportSpecifier[imported.name='listen']", … }
]
```

CI runs it: `.github/workflows/ci.yml` executes
`pnpm --dir apps/desktop lint:ci` (`eslint src/ --max-warnings 0`).

## Consequences

**What follows from this**

- The set of Rust commands the frontend depends on is `grep -r 'invoke' src/data/`.
  A Rust rename has one blast radius.
- A domain's boundary file is the right place for its documentation. Several
  already carry substantial headers explaining the protocol they wrap
  (`convex-auth.ts`, `remote-dictation.ts`, `sync-engine.ts`, `corrections.ts`).
- Boundary modules are unit-testable by mocking `@tauri-apps/api`, which is why
  26 co-located `*.test.ts` files sit next to the 39 modules.
- The `src/data/` directory is large and flat, and it mixes two kinds of module:
  thin command wrappers (`audio.ts`, `toast.ts`) and long-running orchestrators
  with real logic (`sync-engine.ts`, `remote-dictation.ts`, `convex-auth.ts`).
  The second kind sits uneasily with ADR 0001; it exists because that logic
  talks to Convex, not to Rust.

**Known gaps in the enforcement — do not read the lint rule as airtight**

The selector matches *import specifiers named `invoke` / `listen` from two
exact module paths*. It does not catch:

- other members of the same packages — `convertFileSrc` from
  `@tauri-apps/api/core`, `emit` from `@tauri-apps/api/event`, and
  `getCurrentWindow` from `@tauri-apps/api/window` are all imported today from
  `src/features/**`, `src/shared/hooks/**` and `src/main.tsx`;
- aliased imports (`import { invoke as call }`), namespace imports, or
  `await import("@tauri-apps/api/core")`;
- the Tauri plugin packages (`@tauri-apps/plugin-dialog`,
  `-opener`, `-process`).

There is also a weaker, `warn`-level `no-restricted-imports` on
`@tauri-apps/api/*`, but its override list re-enables `src/features/*/*.ts(x)`
and `src/features/*/components/**`, so in practice it constrains very little.

Two more things worth knowing:

- **The local `make ci` target does not run this check.** `make lint` runs
  Biome; `make ci` is `typecheck check test`. The ESLint boundary rule only
  runs in GitHub CI. A violation can be committed and pass every local gate.
- **The error message points at a file that does not exist.** Both selectors
  and both file headers below refer to `ai_docs/f0c-migration-backlog.md`;
  there is no `ai_docs/` directory in the repository.

**Where the convention is stated in prose**

Only two files declare the rule in their own header — `src/data/audio.ts`
("This is the ONLY module allowed to import `invoke`/`listen` … for this
domain") and `src/data/remote-dictation.ts` (same, plus "it's also the only
module that talks to Convex directly", which is no longer true since
`convex-auth.ts` and the sync workers do too). The other 37 modules follow the
convention without stating it. Neither root `AGENTS.md` nor
`apps/desktop/AGENTS.md` mentions `src/data/` at all (root `AGENTS.md`'s only
`data` references are to `packages/ts/data`) — `apps/desktop/AGENTS.md`'s *Frontend
ownership* section predates this boundary and still describes features calling
Tauri directly.

**What this forbids**

- Importing `invoke` or `listen` outside `src/data/**`.
- Putting a command name string anywhere but its domain's boundary file.
- Creating a second boundary directory, a "services" layer, or per-feature
  `api.ts` files alongside `src/data/`.
