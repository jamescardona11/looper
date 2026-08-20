# 0004 — `@looper/data` is the shared data port for web and mobile; desktop deliberately does not use it

## Status

Accepted, with a known cost. **Open to revision** — see *Consequences*.

## Context

`packages/ts/data` (`@looper/data`) is described by `packages/AGENTS.md` as
the single Convex data layer for web and mobile. Desktop is the explicit
exception documented by this decision.

Two apps consume it: `apps/web` and `apps/mobile` (both declare
`"@looper/data": "workspace:*"`). `apps/desktop` does not. It has zero imports
of `@looper/data` and no dependency on it in its `package.json`. Yet the
desktop app does talk to the same Convex backend — for remote dictation
(mobile → desktop paste channel) and for the sync engine (dictionary,
snippets, mode rules, history).

The reason is not neglect. `@looper/data`'s Convex adapter is built for React
clients:

- `src/adapters/convex/provider.tsx` builds a `ConvexReactClient` and mounts
  `@convex-dev/auth`'s `<ConvexAuthProvider>`;
- the auth seam is `useAuth()` over `useConvexAuth()` + `useAuthActions()`;
- every domain surface is a hook (`hooks/account.ts`, `dictation.ts`,
  `meetings.ts`, …) that calls `useQuery`.

None of that fits the desktop:

1. **No single React tree owns the session.** Under ADR 0002 there are four
   Tauri windows, each a separate JS realm. A provider mounted in one window
   is invisible to the others.
2. **Most Convex consumers are not React.** `remote-dictation.ts` and
   `sync-engine.ts` are long-running background workers started imperatively
   from the `main` window (`src/app/runtime/window-services.tsx`). They cannot
   consume hooks.
3. **Transport.** The header of `apps/desktop/src/data/convex-auth.ts` records
   the reason directly: this module "drives `auth:signIn` over the same
   WebSocket `ConvexClient` (via `client.action`) instead of a raw HTTP
   transport — there is no pre-auth chicken-and-egg problem here because
   Convex actions never require an existing session, and `ConvexClient.setAuth`
   is exactly the hook meant for wiring a token fetcher like this one."

## Decision

`apps/desktop` reimplements the slice of Convex Auth it needs, in
`src/data/convex-auth.ts`, on top of `ConvexClient` from `convex/browser`
(the non-React client). It reimplements only the `@convex-dev/auth` wire
protocol for the two providers the backend exposes: call the `auth:signIn`
action with `{ provider, params }`, persist the returned
`{ token, refreshToken }` pair in `localStorage`, and rotate via
`{ refreshToken }` when asked. Provider ids match `backend/convex/auth.ts`
exactly (`"anonymous"`, `"resend-otp"`).

It also listens for cross-window `storage` events on the token key so a
sign-in performed in the `settings` window is picked up by the session running
in `main` without a restart — a problem `@looper/data` does not have and
therefore does not solve.

`@looper/data` remains the mandatory port for `apps/web` and `apps/mobile`.
This ADR carves out desktop, and only desktop.

## Consequences

**The cost, stated plainly**

The anonymous-account rule now lives in two places with no shared test:

| | `packages/ts/data/src/adapters/convex/hooks/account.ts` | `apps/desktop/src/data/convex-auth.ts` |
| --- | --- | --- |
| surface | `useUpgradeFromAnonymous()` hook | `requestEmailOtp` / `verifyEmailOtp` / `ensureAnonymousSession` |
| ordering rule | snapshot anonymous userId + mint upgrade nonce **before** `signIn`, claim **after** | same, inside `verifyEmailOtp` |
| tests | no dedicated upgrade-order contract | dedicated `convex-auth.test.ts` coverage |

The load-bearing part is the ordering: the upgrade nonce can only be minted
while the client still *is* the anonymous user, so it must precede `signIn`,
and the claim must follow it. That invariant is written out as a comment in
both files and verified in one. If the backend changes the upgrade protocol,
one of the two copies will be updated and the other will not, and only the
desktop copy will fail loudly.

Secondary costs:

- Two independent readings of the `@convex-dev/auth` wire format. An upstream
  change to the token/refresh shape breaks desktop silently.
- Provider ids are duplicated as string literals against
  `backend/convex/auth.ts`.
- Backend changes to shared Convex functions need verification against two
  clients, not one.

**Why it is still the right call today**

Making `@looper/data` serve desktop would mean either forcing a React-tree
dependency onto non-React background workers, or splitting the package into a
headless core plus a React layer. The second is the real fix, but it is a
refactor of a package two shipping apps depend on, for one consumer that
currently needs a narrow slice (auth + a handful of function calls).

**Revisit this when**

- desktop's Convex surface grows past auth plus the sync workers — for example
  if it starts consuming the same domain reads web and mobile use; or
- the anonymous → real upgrade protocol changes in `backend/convex/upgrade.ts`
  and the two implementations diverge in production; or
- `@looper/data` grows a headless (non-hook) core for any other reason, at
  which point desktop should consume it.

**Minimum mitigation while it stands**

The upgrade ordering invariant should be covered by one test that both
implementations can be checked against, or at minimum the two files should
name each other. Today `convex-auth.ts` does not mention
`packages/ts/data`, and `account.ts` does not mention desktop.
