// PostHog web SDK initialization.
// Opt-in: the SDK loads only after cookie consent and when VITE_POSTHOG_KEY is set.
// Env vars:
//   VITE_POSTHOG_KEY    phc_... (from PostHog dashboard → Project Settings)
//   VITE_POSTHOG_HOST   https://us.i.posthog.com (default)

type PostHogClient = typeof import("posthog-js")["default"];

const CONSENT_STORAGE_KEY = "cookie-consent";
const key = import.meta.env.VITE_POSTHOG_KEY || undefined;
const host = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
let client: PostHogClient | null = null;
let clientPromise: Promise<PostHogClient | null> | null = null;

export function initPostHog() {
  void loadClient();
}

export function optOutPostHog() {
  client?.opt_out_capturing();
}

// Report an exception to PostHog error tracking. No-op without consent or a configured key.
export function captureError(error: unknown, context?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  withClient((posthog) => posthog.captureException(err, context));
}

function withClient(action: (posthog: PostHogClient) => void) {
  if (!canLoadClient()) return;
  if (client) {
    action(client);
    return;
  }
  void loadClient().then((posthog) => {
    if (posthog) action(posthog);
  });
}

function loadClient(): Promise<PostHogClient | null> {
  if (!canLoadClient()) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (clientPromise) return clientPromise;

  clientPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key!, {
        api_host: host,
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        persistence: "localStorage+cookie",
      });
      client = posthog;
      return posthog;
    })
    .catch(() => {
      clientPromise = null;
      return null;
    });

  return clientPromise;
}

function canLoadClient() {
  if (!key || typeof localStorage === "undefined") return false;
  return localStorage.getItem(CONSENT_STORAGE_KEY) === "accepted";
}
