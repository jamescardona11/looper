// Type-safe backend environment variables via @t3-oss/env-core.
//
// Convex specifics:
// - All vars are `.optional()`. Convex determines the set of callable functions
//   at deploy time, so a hard-throw at module load (a missing REQUIRED var)
//   would break the deployment. Each feature checks its own key at call time
//   via `requireEnv(...)` and fails only when that feature is actually used.
// - Values are read from `process.env` at module load. Convex injects env vars
//   (set with `npx convex env set`) at deploy time, so the snapshot is correct;
//   it refreshes on the next deploy/reload.

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // AI / LLM
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    DEEPGRAM_API_KEY: z.string().optional(),
    ASSEMBLYAI_API_KEY: z.string().optional(),
    ELEVENLABS_API_KEY: z.string().optional(),
    STT_PROVIDER: z
      .union([
        z.literal("deepgram"),
        z.literal("openai"),
        z.literal("assemblyai"),
        z.literal("elevenlabs"),
      ])
      .optional(),
    // Authentication email and transactional delivery.
    RESEND_API_KEY: z.string().optional(),
    AUTH_FROM_EMAIL: z.string().optional(),
    // Payments
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_ULTRA_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_ULTRA_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_CREDITS_100_PRICE_ID: z.string().optional(),
    STRIPE_CREDITS_500_PRICE_ID: z.string().optional(),
    STRIPE_LIFETIME_PRICE_ID: z.string().optional(),
    REVENUECAT_API_KEY: z.string().optional(),
    REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
    // Analytics
    POSTHOG_API_KEY: z.string().optional(),
    // Auth / crypto / admin
    BYOK_ENCRYPTION_SECRET: z.string().optional(),
    ADMIN_EMAILS: z.string().optional(),
    // Provider-free mode for deterministic development and CI responses.
    MOCK_MODE: z.string().optional(),
    // Provided by Convex at runtime
    CONVEX_SITE_URL: z.string().url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // Convex functions always run server-side. Set explicitly so t3env doesn't
  // misdetect (e.g. test runtimes that define `window`) and block access.
  isServer: true,
});

export function isMockMode(): boolean {
  const v = process.env.MOCK_MODE;
  return v === "true" || v === "1";
}

// Helper for features that genuinely require a key — throws a clear,
// actionable error only when the feature is invoked without its key set.
export function requireEnv(key: keyof typeof env): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `Missing environment variable ${String(key)}. Set it with: npx convex env set ${String(key)} <value>`,
    );
  }
  return value;
}
