// BYOK (Bring Your Own Key) — encrypted user-supplied API keys.
// AES-GCM ciphertext + IV stored separately, key derived via PBKDF2 from
// the BYOK_ENCRYPTION_SECRET env var on the Convex deployment. Plaintext
// never lands on disk and is only resolved inside the reply action.
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const userKeysTables = {
  userApiKeys: defineTable({
    userId: v.id("users"),
    // BYOK supports the three LLM providers the agent can route to. Existing
    // rows are "openai" and stay valid under the widened union (no migration).
    provider: v.union(v.literal("openai"), v.literal("anthropic"), v.literal("google")),
    ciphertext: v.string(),
    iv: v.string(),
    createdAt: v.number(),
    lastTestedAt: v.optional(v.number()),
    lastTestOk: v.optional(v.boolean()),
    lastTestError: v.optional(v.string()),
  }).index("by_user_provider", ["userId", "provider"]),
};
