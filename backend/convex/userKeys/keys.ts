// BYOK API surface — user-supplied LLM keys (OpenAI, Anthropic, Google),
// encrypted at rest. Every function is keyed by `provider`.
//
// Public:
//   - status (query): per-provider configured flag + last-test info.
//   - saveKey (action): validate, encrypt, upsert for a provider.
//   - testKey (action): decrypt, hit the provider's list endpoint, record.
//   - clearKey (mutation): delete a provider's key row.
//
// Internal:
//   - _getEncrypted / _upsertEncrypted / _markTestResult (persistence)
//   - _resolvePlaintextForUser (decrypts for the reply action; never public)

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { decryptKey, encryptKey } from "./crypto";

const providerValidator = v.union(v.literal("openai"), v.literal("anthropic"), v.literal("google"));
type Provider = "openai" | "anthropic" | "google";

type ProviderMeta = {
  label: string;
  // Loose client-side sanity check; the live test endpoint is the real check.
  looksValid: (key: string) => boolean;
  // Returns null on success, or a human error string.
  test: (key: string) => Promise<string | null>;
};

const PROVIDERS: Record<Provider, ProviderMeta> = {
  openai: {
    label: "OpenAI",
    looksValid: (k) => k.startsWith("sk-") && k.length >= 20,
    test: async (k) => {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${k}` },
      });
      return res.ok ? null : `OpenAI returned ${res.status}: ${(await res.text()).slice(0, 160)}`;
    },
  },
  anthropic: {
    label: "Anthropic",
    looksValid: (k) => k.startsWith("sk-ant-") && k.length >= 20,
    test: async (k) => {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": k, "anthropic-version": "2023-06-01" },
      });
      return res.ok
        ? null
        : `Anthropic returned ${res.status}: ${(await res.text()).slice(0, 160)}`;
    },
  },
  google: {
    label: "Google AI",
    looksValid: (k) => k.startsWith("AIza") && k.length >= 20,
    test: async (k) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
      );
      return res.ok ? null : `Google returned ${res.status}: ${(await res.text()).slice(0, 160)}`;
    },
  },
};

const ALL_PROVIDERS: Provider[] = ["openai", "anthropic", "google"];

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId))
      .collect();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    return ALL_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        label: PROVIDERS[provider].label,
        configured: !!row,
        createdAt: row?.createdAt ?? null,
        lastTestedAt: row?.lastTestedAt ?? null,
        lastTestOk: row?.lastTestOk ?? null,
        lastTestError: row?.lastTestError ?? null,
      };
    });
  },
});

export const saveKey = action({
  args: { provider: providerValidator, plaintext: v.string() },
  handler: async (ctx, { provider, plaintext }): Promise<{ ok: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const trimmed = plaintext.trim();
    if (!PROVIDERS[provider].looksValid(trimmed)) {
      throw new Error(`That doesn't look like a ${PROVIDERS[provider].label} API key.`);
    }
    const { ciphertext, iv } = await encryptKey(trimmed);
    await ctx.runMutation(internal.userKeys.keys._upsertEncrypted, {
      userId,
      provider,
      ciphertext,
      iv,
    });
    return { ok: true };
  },
});

export const clearKey = mutation({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const row = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
      .first();
    if (row) await ctx.db.delete(row._id);
    return { ok: true };
  },
});

export const testKey = action({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }): Promise<{ ok: boolean; error: string | null }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const row = await ctx.runQuery(internal.userKeys.keys._getEncrypted, { userId, provider });
    if (!row) throw new Error("No key configured");
    let result: { ok: boolean; error: string | null } = { ok: false, error: null };
    try {
      const plaintext = await decryptKey({ ciphertext: row.ciphertext, iv: row.iv });
      const error = await PROVIDERS[provider].test(plaintext);
      result = { ok: error === null, error };
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : "unknown error" };
    }
    await ctx.runMutation(internal.userKeys.keys._markTestResult, {
      userId,
      provider,
      ok: result.ok,
      error: result.error,
    });
    return result;
  },
});

// ---- Internal ----

export const _getEncrypted = internalQuery({
  args: { userId: v.id("users"), provider: providerValidator },
  handler: async (ctx, { userId, provider }) => {
    const row = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
      .first();
    if (!row) return null;
    return { ciphertext: row.ciphertext, iv: row.iv };
  },
});

export const _upsertEncrypted = internalMutation({
  args: {
    userId: v.id("users"),
    provider: providerValidator,
    ciphertext: v.string(),
    iv: v.string(),
  },
  handler: async (ctx, { userId, provider, ciphertext, iv }) => {
    const existing = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ciphertext,
        iv,
        lastTestedAt: undefined,
        lastTestOk: undefined,
        lastTestError: undefined,
      });
      return existing._id;
    }
    return ctx.db.insert("userApiKeys", {
      userId,
      provider,
      ciphertext,
      iv,
      createdAt: Date.now(),
    });
  },
});

export const _markTestResult = internalMutation({
  args: {
    userId: v.id("users"),
    provider: providerValidator,
    ok: v.boolean(),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { userId, provider, ok, error }) => {
    const row = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      lastTestedAt: Date.now(),
      lastTestOk: ok,
      lastTestError: error ?? undefined,
    });
  },
});

// Internal helper: returns plaintext key for the reply action.
// MUST be internalAction — exposing plaintext keys publicly would be a security bug.
export const _resolvePlaintextForUser = internalAction({
  args: { userId: v.id("users"), provider: providerValidator },
  handler: async (ctx, { userId, provider }): Promise<string | null> => {
    const row = await ctx.runQuery(internal.userKeys.keys._getEncrypted, { userId, provider });
    if (!row) return null;
    try {
      return await decryptKey({ ciphertext: row.ciphertext, iv: row.iv });
    } catch {
      return null;
    }
  },
});
