// Shared test harness for metered speech-to-text actions. These actions run the
// same cross-cutting prologue
// (auth -> mock -> assertCredits -> provider key) and then call a real provider
// over `fetch`, so their characterization tests need the same three things:
//
//   1. the `rateLimiter` component registered (assertCredits consumes from it),
//   2. a `fetch` stub that answers provider hosts with canned bytes and lets the
//      Convex storage download succeed (convex-test's storage URL 400s on a real
//      fetch), while RECORDING which provider hosts were hit,
//   3. an observable charge signal — the public `agent.credits.balance` query
//      reports `used > 0` once assertCredits has consumed the rate limiter.
//
// This module exports plain helpers only (no Convex functions), so it is never
// evaluated inside the convex-test function sandbox.

import type { convexTest } from "convex-test";
import { vi } from "vitest";
import rateLimiterSchema from "../../node_modules/@convex-dev/rate-limiter/src/component/schema";

// Glob of the rate-limiter component's own modules, relative to THIS file.
const rateLimiterModules = (
  import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }
).glob("../../node_modules/@convex-dev/rate-limiter/src/component/**/*.ts");

// Register the rateLimiter component so assertCredits' rate-limiter calls resolve.
export function registerRateLimiter(
  t: ReturnType<typeof convexTest>,
): ReturnType<typeof convexTest> {
  t.registerComponent("rateLimiter", rateLimiterSchema as never, rateLimiterModules);
  return t;
}

// The `env` object (convex/env.ts) is built EAGERLY on first import and caches
// every key, so a later `vi.stubEnv` for a key that was already read as unset is
// a no-op. Provider keys must therefore be stubbed in `beforeAll`, before the
// first action invocation in the file constructs `env`. Stubbing them all (incl.
// overriding any ambient real OPENAI_API_KEY with a fake) also guarantees no test
// ever makes a real provider call — every provider host is answered by stubFetch.
export function stubProviderKeys(keys: Record<string, string>): void {
  for (const [name, value] of Object.entries(keys)) {
    vi.stubEnv(name, value);
  }
}

export type ProviderResponder = (url: string, init?: RequestInit) => Response | undefined;

// Install a fetch spy. `provider(url)` returns a canned Response for provider
// hosts (and the call is recorded in the returned array); every other URL — i.e.
// the Convex file-storage download — gets a 200 with a few audio bytes so the
// pre-provider `storage.getUrl` + `fetch` step in some actions succeeds.
export function stubFetch(provider: ProviderResponder): { providerCalls: string[] } {
  const providerCalls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as { url: string }).url;
    const canned = provider(url, init);
    if (canned) {
      providerCalls.push(url);
      return canned;
    }
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  }) as typeof fetch);
  return { providerCalls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Re-root the keys of a `import.meta.glob("../**/*.ts")` map (called from a test
// living in convex/<subdir>/) to the convex/-relative keys convex-test expects.
//   "../admin.ts"        → "./admin.ts"
//   "../stt/transcribe.ts" (same subdir, "./x.ts") → "./stt/transcribe.ts"
// `subdir` is the test file's directory under convex/, e.g. "stt".
export function rerootModules(
  rawModules: Record<string, () => Promise<unknown>>,
  subdir: string,
): Record<string, () => Promise<unknown>> {
  const nestedTestFolder = Object.keys(rawModules).some((path) => path.startsWith("../../"));
  return Object.fromEntries(
    Object.entries(rawModules).map(([path, loader]) => {
      const rerooted = nestedTestFolder
        ? path.startsWith("../../")
          ? `./${path.slice(6)}`
          : `./${subdir}/${path.slice(3)}`
        : path.startsWith("../")
          ? `./${path.slice(3)}`
          : `./${subdir}/${path.slice(2)}`;
      return [rerooted, loader];
    }),
  );
}
