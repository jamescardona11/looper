import type { StripePriceOverrides } from "@looper/config/billing";
import { env } from "../env";

export const stripePriceOverrides: StripePriceOverrides = {
  pro: {
    monthly: env.STRIPE_PRO_MONTHLY_PRICE_ID,
    yearly: env.STRIPE_PRO_YEARLY_PRICE_ID,
  },
  ultra: {
    monthly: env.STRIPE_ULTRA_MONTHLY_PRICE_ID,
    yearly: env.STRIPE_ULTRA_YEARLY_PRICE_ID,
  },
  oneTime: {
    credits_100: env.STRIPE_CREDITS_100_PRICE_ID,
    credits_500: env.STRIPE_CREDITS_500_PRICE_ID,
    lifetime: env.STRIPE_LIFETIME_PRICE_ID,
  },
};
