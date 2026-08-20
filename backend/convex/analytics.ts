// PostHog analytics via @posthog/convex component.
// Server-side event tracking. Web feature flags are evaluated client-side via
// posthog-js, so no server query is needed.
//
// Env vars:
//   POSTHOG_API_KEY   phc_... (from PostHog dashboard → Project Settings)
//
// Configure POSTHOG_API_KEY in the target Convex deployment.

import { PostHog } from "@posthog/convex";
import { components } from "./_generated/api";
import { env } from "./env";

export const posthog = new PostHog(components.posthog, {
  apiKey: env.POSTHOG_API_KEY,
});
