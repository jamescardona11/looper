// Pre-launch waitlist with referral codes. Spread via ...waitlistTables.
// Each signup gets a short referral code; joining with someone's code credits
// that referrer (referredBy). Position is derived from createdAt order.
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const waitlistTables = {
  waitlist: defineTable({
    email: v.string(),
    // The signup's own shareable code (e.g. "a3f9c2").
    referralCode: v.string(),
    // The referralCode this person used to join, if any.
    referredBy: v.optional(v.string()),
    referralCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_code", ["referralCode"])
    .index("by_referred_by", ["referredBy"]),
};
