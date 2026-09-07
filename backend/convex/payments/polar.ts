// Polar payments via @convex-dev/polar component.
// Polar is a Merchant of Record — handles tax, VAT, and compliance for you.
//
// Env vars configured in the target Convex deployment:
//   POLAR_ORGANIZATION_TOKEN   your org token from Polar dashboard
//   POLAR_WEBHOOK_SECRET       whsec_... from Polar webhook settings
//   POLAR_SERVER                "sandbox" or "production" (default: sandbox)
//
// Setup:
//   1. Create a Polar account at polar.sh
//   2. Set env vars above
//   3. Create products in Polar dashboard (subscriptions + one-time)
//   4. Replace product IDs below
//   5. Run `pnpm --dir backend dev` to sync products

import { getAuthUserId } from "@convex-dev/auth/server";
import { Polar } from "@convex-dev/polar";
import { PRODUCT_ACCESS_IS_FREE } from "@looper/config/billing";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { action } from "../_generated/server";

export const polar = new Polar((components as any).polar, {
  products: {
    // Subscriptions (recurring). Polar models the interval PER product, so monthly
    // and yearly are distinct products keyed with a `_yearly` suffix. The web
    // checkout maps (tier, interval) → these keys. Keep these IDs in sync with
    // billing-config.ts `polar.{monthly,yearly}` (the single source for tier↔price).
    pro: "REPLACE_WITH_POLAR_PRO_MONTHLY_PRODUCT_ID",
    pro_yearly: "REPLACE_WITH_POLAR_PRO_YEARLY_PRODUCT_ID",
    ultra: "REPLACE_WITH_POLAR_ULTRA_MONTHLY_PRODUCT_ID",
    ultra_yearly: "REPLACE_WITH_POLAR_ULTRA_YEARLY_PRODUCT_ID",
    // One-time credit top-ups
    credits_100: "REPLACE_WITH_POLAR_100_CREDITS_PRODUCT_ID",
    credits_500: "REPLACE_WITH_POLAR_500_CREDITS_PRODUCT_ID",
    // Metered (pay-per-use) — create as metered product in Polar dashboard
    metered_ai: "REPLACE_WITH_POLAR_METERED_AI_PRODUCT_ID",
  },
  getUserInfo: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const email =
      user?.email && String(user.email).includes("@") ? user.email : `anon-${userId}@gmail.com`;
    return { userId, email };
  },
});

export const createCheckout = action({
  args: {
    productKey: v.string(),
    successUrl: v.string(),
  },
  handler: async (ctx, { productKey, successUrl }) => {
    if (PRODUCT_ACCESS_IS_FREE) {
      throw new Error("Commercial billing is unavailable while Looper is free to use");
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    const productId = (polar.products as Record<string, string>)[productKey];
    if (!productId || productId.startsWith("REPLACE_")) {
      throw new Error(
        `Polar product ID for "${productKey}" not configured. Edit backend/convex/payments/polar.ts.`,
      );
    }

    const email = await ctx.runQuery(internal.payments.emailForUser, { userId });

    const checkout = await polar.createCheckoutSession(ctx as any, {
      productIds: [productId],
      userId,
      email,
      // Carried through to the subscription so the webhook bridge can map the
      // Polar subscription back to our Convex user (the component does not set
      // the Polar customer external_id).
      metadata: { userId },
      origin: new URL(successUrl).origin,
      successUrl,
    });

    return { url: checkout.url };
  },
});

export const customerPortal = action({
  args: { returnUrl: v.optional(v.string()) },
  handler: async (ctx, { returnUrl }) => {
    if (PRODUCT_ACCESS_IS_FREE) {
      throw new Error("Commercial billing is unavailable while Looper is free to use");
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    return await polar.createCustomerPortalSession(ctx as any, {
      userId,
      returnUrl,
    });
  },
});
