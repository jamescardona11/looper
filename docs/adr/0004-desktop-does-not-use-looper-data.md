# 0004 — `@looper/data` is the shared data port for web and mobile; desktop deliberately does not use it

## Status

Accepted, with a known cost. **Open to revision** — see *Consequences*.

## Context

`@looper/data` exposes React providers and hooks for web and mobile. Desktop
also talks to Convex, but its sync and remote-dictation workers run outside a
React component tree.

1. **No single React tree owns the session.** Under ADR 0002 there are four
   Tauri windows, each a separate JS realm. A provider mounted in one window
   is invisible to the others.
2. **Most Convex consumers are not React.** `remote-dictation.ts` and
   `sync-engine.ts` are long-running background workers started imperatively
   from the `main` window. Hooks cannot serve them.

## Decision

Desktop uses `ConvexClient` from `convex/browser` directly inside
`apps/desktop/src/data`. `convex-auth.ts` owns the anonymous and email-OTP
flows desktop needs, including token persistence, refresh, and account-upgrade
ordering. Provider IDs remain aligned with `backend/convex/auth.ts`.

The module listens for cross-window `storage` events so a sign-in in
`settings` reaches the session running in `main` without a restart.

`@looper/data` remains the mandatory port for `apps/web` and `apps/mobile`.
Desktop is the only exception.

## Consequences

- Anonymous-account upgrade ordering exists in both
  `packages/ts/data/src/adapters/convex/hooks/account.ts` and
  `apps/desktop/src/data/convex-auth.ts`: mint the nonce before sign-in and
  claim after sign-in. The files name the parallel implementation; desktop has
  dedicated coverage, while the shared hook still lacks an equivalent test.
- Auth wire-format and provider-ID changes must be verified against both
  clients.
- Do not force background workers through React providers or create another
  desktop Convex layer outside `src/data`.
- Revisit this decision if desktop begins consuming broader shared domains or
  `@looper/data` gains a headless core. At that point desktop should consume
  the shared headless boundary instead of extending its exception.
