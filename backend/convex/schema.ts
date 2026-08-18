import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { agentTables } from "./agent/schema";
import { dictationTables } from "./dictation/schema";
import { feedbackTables } from "./feedback/schema";
import { meetingTables } from "./meetings/schema";
import { notesTables } from "./notes/schema";
import { onboardingTables } from "./onboarding/schema";
import { paymentsTables } from "./payments/schema";
import { sttTables } from "./stt/schema";
import { userKeysTables } from "./userKeys/schema";
import { waitlistTables } from "./waitlist/schema";

export default defineSchema({
  ...authTables,
  ...agentTables,
  ...dictationTables,
  ...feedbackTables,
  ...meetingTables,
  ...notesTables,
  ...onboardingTables,
  ...paymentsTables,
  ...sttTables,
  ...userKeysTables,
  ...waitlistTables,

  // DB-managed admin grants. Complements the ADMIN_EMAILS env var so admins
  // can be promoted/demoted without redeploying environment variables.
  adminUsers: defineTable({ userId: v.id("users") }).index("by_user", ["userId"]),

  // Per-user mock-mode opt-in (Settings → Developer). A row means this user gets
  // canned AI/STT responses with no real API keys — for trying the
  // product keyless. The global MOCK_MODE env still forces it for everyone
  // (development/CI); this table is the per-user layer on top. See convex/mock.ts.
  userMockMode: defineTable({ userId: v.id("users") }).index("by_user", ["userId"]),
});
