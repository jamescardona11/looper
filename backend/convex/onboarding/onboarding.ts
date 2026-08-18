// Onboarding state queries + mutations. Edit STEPS to match your flow.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// Customize this list to your onboarding flow. Must match the steps the web
// wizard renders (apps/web/src/routes/welcome.tsx) — an id here that the UI
// doesn't implement leaves the wizard blank on that step.
export const STEPS = ["profile", "trial", "tour"] as const;

// Reactive query: current state for the authenticated user
export const myState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const existing = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing) {
      // Synthetic initial state for users who have not started
      return {
        userId,
        currentStep: STEPS[0],
        completedSteps: [],
        skippedSteps: [],
        isComplete: false,
        startedAt: null,
      };
    }
    return {
      userId,
      currentStep: existing.currentStep,
      completedSteps: existing.completedSteps,
      skippedSteps: existing.skippedSteps,
      isComplete: existing.isComplete,
      startedAt: existing.startedAt,
    };
  },
});

// Mark current step complete + advance to next
export const completeStep = mutation({
  args: { step: v.string(), data: v.optional(v.string()) },
  handler: async (ctx, { step, data }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    const existing = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const idx = (STEPS as readonly string[]).indexOf(step);
    const next = idx >= 0 && idx + 1 < STEPS.length ? STEPS[idx + 1] : null;
    const isComplete = next === null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        currentStep: next ?? step,
        completedSteps: [...new Set([...existing.completedSteps, step])],
        payload: data ?? existing.payload,
        isComplete,
        completedAt: isComplete ? Date.now() : undefined,
      });
    } else {
      await ctx.db.insert("onboardingStates", {
        userId,
        currentStep: next ?? step,
        completedSteps: [step],
        skippedSteps: [],
        payload: data,
        isComplete,
        startedAt: Date.now(),
        completedAt: isComplete ? Date.now() : undefined,
      });
    }
  },
});

// Mark a step as skipped (still advance)
export const skipStep = mutation({
  args: { step: v.string() },
  handler: async (ctx, { step }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    const existing = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const idx = (STEPS as readonly string[]).indexOf(step);
    const next = idx >= 0 && idx + 1 < STEPS.length ? STEPS[idx + 1] : null;
    const isComplete = next === null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        currentStep: next ?? step,
        skippedSteps: [...new Set([...existing.skippedSteps, step])],
        isComplete,
        completedAt: isComplete ? Date.now() : undefined,
      });
    }
  },
});

// Force-complete (e.g. user clicked "skip onboarding entirely")
export const skipAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const existing = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isComplete: true,
        completedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("onboardingStates", {
        userId,
        currentStep: STEPS[STEPS.length - 1]!,
        completedSteps: [],
        skippedSteps: [...STEPS],
        isComplete: true,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
    }
  },
});
