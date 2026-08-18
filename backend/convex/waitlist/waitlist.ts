// Pre-launch waitlist: join (idempotent by email), with referral credit.
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// Derive a short, stable, URL-safe code from the email + a salt. Deterministic
// (no Math.random) so the same email always yields the same code, which also
// makes join idempotent on the code.
function referralCodeFor(email: string): string {
  let h = 2166136261;
  const input = `${email.toLowerCase()}|waitlist`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const join = mutation({
  args: {
    email: v.string(),
    referredBy: v.optional(v.string()),
  },
  handler: async (ctx, { email, referredBy }) => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) throw new Error("Enter a valid email");

    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();

    // Idempotent: re-joining returns the existing code instead of erroring.
    if (existing) {
      return { referralCode: existing.referralCode, alreadyJoined: true };
    }

    const referralCode = referralCodeFor(normalized);

    // Credit the referrer if a valid, different code was supplied.
    if (referredBy && referredBy !== referralCode) {
      const referrer = await ctx.db
        .query("waitlist")
        .withIndex("by_code", (q) => q.eq("referralCode", referredBy))
        .unique();
      if (referrer) {
        await ctx.db.patch(referrer._id, { referralCount: referrer.referralCount + 1 });
      }
    }

    await ctx.db.insert("waitlist", {
      email: normalized,
      referralCode,
      ...(referredBy ? { referredBy } : {}),
      referralCount: 0,
      createdAt: Date.now(),
    });

    return { referralCode, alreadyJoined: false };
  },
});

// Public-ish status by code: position in line + how many you've referred.
export const statusByCode = query({
  args: { referralCode: v.string() },
  handler: async (ctx, { referralCode }) => {
    const entry = await ctx.db
      .query("waitlist")
      .withIndex("by_code", (q) => q.eq("referralCode", referralCode))
      .unique();
    if (!entry) return null;

    // Position = how many joined at or before this entry.
    const ahead = await ctx.db
      .query("waitlist")
      .withIndex("by_email")
      .filter((q) => q.lte(q.field("createdAt"), entry.createdAt))
      .collect();

    return {
      referralCode: entry.referralCode,
      referralCount: entry.referralCount,
      position: ahead.length,
    };
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("waitlist").collect();
    return all.length;
  },
});
