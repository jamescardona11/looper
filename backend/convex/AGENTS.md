# Agent Rules — backend/convex

Convex reactive backend. Global rules: see root `AGENTS.md`. Module-specific:

## Structure
- One folder per capability. Each owns a `schema.ts` exporting its tables; they're
  spread into the root `schema.ts`.
- `convex.config.ts` registers the components required by selected capabilities.

## Functions
- `query` / `mutation` / `action` are PUBLIC (callable from clients). `internalQuery`
  / `internalMutation` / `internalAction` are private (only `internal.*` + scheduler).
  **An internal helper named `_foo` MUST be `internalQuery/Mutation`, never `query`** —
  a public `query` with no ownership check is an IDOR.
- Always `const userId = await getAuthUserId(ctx); if (!userId) throw …` and scope
  every read/write to that user.
- Row ownership is NOT hand-written. Use `assertOwned(ctx, table, id, userId, message)`
  from `lib/ownership.ts`: it loads the row, throws `message` when the row is missing
  OR foreign — the two cases stay indistinguishable on purpose, so a probe cannot tell
  them apart — and returns the typed document for the callers that need the row.
  `findOwned` is the same check for read paths that answer an unauthorized caller with
  empty data instead of an error. The message stays at the call site: it is observable
  API surface. Read the header of `lib/ownership.ts` before assuming it does more than
  this; it is a deduplicated prologue with one invariant, not a deep module.
- Validate every public arg with `v.*`. Avoid `v.any()` except metadata bound for
  external systems (PostHog, Resend, speech and payment providers).

## Env vars — NOT `.env`
- All env vars live in the Convex deployment: `npx convex env set KEY value`.
- `env.ts` (t3env) declares them all `.optional()` — a feature checks its own key at
  call time (it must not hard-throw at module load). Keep the relevant
  `.env.example` synchronized when adding a variable.

## Recording Assistant (`agent/`)
- `reply.ts` runs `streamText` (AI SDK v6) and patches the assistant row per chunk.
- Model resolved by `resolveLanguageModel` (`models.ts`) — BYOK key overrides the
  server key per provider. `AI_MODEL` (optional, default `gpt-4o-mini`) picks the model;
  provider is derived from it. Never set `AI_MODEL` to an empty string.
- The only tool searches the authenticated user's transcript history. Threads are
  private and text-only; do not add public sharing or general web tools.

## Verify
- `npx convex dev --once` (deploy + typecheck + push) and `npx tsc --noEmit`, then
  `npx vitest run`. The deploy is the real check — it validates the whole function graph.
