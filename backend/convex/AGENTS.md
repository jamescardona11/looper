# Agent Rules — backend/convex

Convex backend rules. Global guidance is in the root `AGENTS.md`.

## Structure

- Each capability owns a folder and a `schema.ts`; the root `schema.ts`
  combines those tables.
- `convex.config.ts` registers only the components required by active
  capabilities.

## Functions and authorization

- `query`, `mutation`, and `action` are public client-callable functions.
  `internalQuery`, `internalMutation`, and `internalAction` are private to
  `internal.*` callers and the scheduler.
- Helpers named `_foo` must be internal functions. Never expose an ownership-free
  helper as a public query.
- Authenticate and scope every operation over user-owned data. An intentionally
  public endpoint requires a documented product reason and must not expose
  private rows or private aggregates.
- Use `assertOwned` or `findOwned` from `lib/ownership.ts` instead of rewriting
  row-ownership checks. Keep missing and foreign rows indistinguishable.
- Validate every public argument with `v.*`. Limit `v.any()` to metadata owned
  by an external system.

## Environment and providers

- Runtime secrets belong in the Convex deployment. Local connection metadata
  may live in ignored local env files; committed examples contain names and
  safe placeholders only.
- `env.ts` declares optional variables so each capability validates its own
  requirements at call time rather than failing at module load.
- Keep environment examples synchronized when adding or renaming a variable.
- The recording assistant uses AI SDK `streamText`; model selection belongs in
  the existing model/config owners. BYOK credentials remain scoped to the
  authenticated user.

## Verification

- Run `pnpm --filter @looper/backend typecheck` and
  `pnpm --filter @looper/backend test` for backend changes.
- Local checks do not prove a published Convex graph or provider integration.
  Run deployment/provider verification only when the task explicitly requires
  it and the target environment is known.
