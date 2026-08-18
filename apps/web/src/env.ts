// Type-safe environment variables via @t3-oss/env-core.
// Build fails with a clear error if required vars are missing.

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_POSTHOG_KEY: z.string().optional(),
    VITE_POSTHOG_HOST: z.url().optional(),
    VITE_STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
    VITE_STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
    VITE_STRIPE_ULTRA_MONTHLY_PRICE_ID: z.string().optional(),
    VITE_STRIPE_ULTRA_YEARLY_PRICE_ID: z.string().optional(),
    VITE_STRIPE_CREDITS_100_PRICE_ID: z.string().optional(),
    VITE_STRIPE_CREDITS_500_PRICE_ID: z.string().optional(),
    VITE_STRIPE_LIFETIME_PRICE_ID: z.string().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
