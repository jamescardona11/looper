// The "metered AI action" prologue, in one place.
//
// Every paid cloud STT action opens with
// the same cross-cutting dance: authenticate the caller, resolve the per-user
// mock flag, charge credits when NOT mocked, and pick the API key to use
// (the operator's server key, or the user's own BYOK key when they brought one).
// Copy-pasting that across features meant the invariants — "skip the charge in
// mock", "BYOK bypasses the charge AND should use the user's key" — drifted
// per feature (some features forgot to honor mock for the provider call).
//
// A user's supported BYOK key is used for the real call when available.
// Non-BYOK STT providers (Deepgram, AssemblyAI and ElevenLabs) always use the
// server key. The decision is `selectApiKey` (pure and unit-tested).
//
// `beginMeteredAction` is a ctx-helper (not a registered Convex function, so no
// codegen) that runs the prologue once and returns { userId, mock, apiKey }.
// Each feature keeps its own provider-specific call; it just branches on `mock`
// to return a canned result, and uses `apiKey` for the real call.

import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

// Providers for which a user can bring their own key (userKeys/keys.ts). Only
// these can be resolved to a plaintext BYOK key; other providers (deepgram,
// assemblyai, elevenlabs, replicate) always use the server key.
const BYOK_PROVIDERS = new Set(["openai", "anthropic", "google"]);

// The BYOK-extension rule, as a pure decision (exported for unit tests). Use the
// user's own key ONLY when all hold: they were detected as BYOK for this action,
// the provider is BYOK-capable, and a plaintext key actually resolved. Otherwise
// fall back to the operator's server key (which may itself be undefined).
export function selectApiKey(opts: {
  byok: boolean;
  provider: string;
  serverApiKey: string | undefined;
  userKey: string | null | undefined;
}): string | undefined {
  if (opts.byok && BYOK_PROVIDERS.has(opts.provider) && opts.userKey) {
    return opts.userKey;
  }
  return opts.serverApiKey;
}

export type MeteredActionArgs = {
  // Credit cost of this action (weighted; see FEATURE_CREDIT_COST). Charged via
  // assertCredits when not in mock mode.
  cost: number;
  // The provider this action routes through — drives per-feature BYOK bypass and
  // BYOK key resolution.
  provider: string;
  // Human-readable reason recorded on the credit transaction.
  reason: string;
  // The operator's server key for `provider` (env.<PROVIDER>_API_KEY). Used as
  // the default; a resolved BYOK key overrides it. May be undefined — the
  // feature still validates presence before a real provider call.
  serverApiKey: string | undefined;
  // Optional input validation, run AFTER auth but BEFORE any charge, so an
  // invalid request is rejected without spending credits. Throw to reject.
  validate?: () => void;
};

export type MeteredActionContext = {
  userId: Id<"users">;
  // Effective per-user mock flag (env MOCK_MODE OR the user's opt-in row). When
  // true the feature MUST return a canned result and skip the real provider.
  mock: boolean;
  // The key to use for the real provider call: the user's BYOK key when they
  // have one for `provider` (and it's a BYOK-capable provider), else the server
  // key. Undefined only when neither exists.
  apiKey: string | undefined;
};

// Run the metered-action prologue: auth -> mock -> (charge if !mock) -> key.
// Throws "Must be signed in" when unauthenticated, mirroring every feature's
// original guard. In mock mode no charge happens and the server key is returned
// as-is (the feature won't use it).
export async function beginMeteredAction(
  ctx: ActionCtx,
  { cost, provider, reason, serverApiKey, validate }: MeteredActionArgs,
): Promise<MeteredActionContext> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Must be signed in");
  // Reject invalid input after auth, before any charge — preserves each
  // feature's original auth -> validate -> charge ordering.
  validate?.();

  const mock = await ctx.runQuery(internal.mock.mockEnabledFor, { userId });
  if (mock) {
    return { userId, mock: true, apiKey: serverApiKey };
  }

  const charge = await ctx.runMutation(internal.agent.credits.assertCredits, {
    userId,
    cost,
    idempotencyKey: crypto.randomUUID(),
    reason,
    provider,
  });

  // assertCredits reports byok when the user has their own key for `provider`
  // (and therefore wasn't charged). For BYOK-capable providers, resolve that key
  // so the real call uses it instead of the server key.
  const byok = "byok" in charge && charge.byok === true;
  let userKey: string | null = null;
  if (byok && BYOK_PROVIDERS.has(provider)) {
    userKey = await ctx.runAction(internal.userKeys.keys._resolvePlaintextForUser, {
      userId,
      provider: provider as "openai" | "anthropic" | "google",
    });
  }

  return { userId, mock: false, apiKey: selectApiKey({ byok, provider, serverApiKey, userKey }) };
}
