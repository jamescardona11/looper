// Onboarding state per user. Single row per user, reactive across devices.
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const onboardingTables = {
  onboardingStates: defineTable({
    userId: v.id("users"),
    currentStep: v.string(), // current step id
    completedSteps: v.array(v.string()),
    skippedSteps: v.array(v.string()),
    payload: v.optional(v.string()), // JSON of data collected per step
    isComplete: v.boolean(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),
};
