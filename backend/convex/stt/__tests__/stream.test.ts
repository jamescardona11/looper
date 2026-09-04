// Characterization tests for the free-launch live-STT session action.
//
// createStreamSession mints a short-lived provider token without consuming
// credits. Mock mode still returns { mock: true, token: "" } without a provider
// call.

import { convexTest } from "convex-test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  json,
  registerRateLimiter,
  rerootModules,
  stubFetch,
  stubProviderKeys,
} from "../../../test-support/meteredHarness";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../../**/*.ts",
  ),
  "stt",
);

const setup = () => registerRateLimiter(convexTest(schema, modules));

beforeAll(() =>
  stubProviderKeys({
    DEEPGRAM_API_KEY: "test-key",
    ASSEMBLYAI_API_KEY: "assembly-test-key",
  }),
);
afterAll(() => vi.unstubAllEnvs());
afterEach(() => vi.restoreAllMocks());

const deepgramGrant = (url: string) =>
  url.includes("deepgram.com/v1/auth/grant") ? json({ access_token: "tok-123" }) : undefined;

const assemblyGrant = (url: string, init?: RequestInit) => {
  if (!url.includes("streaming.assemblyai.com/v3/token")) return undefined;
  expect(new Headers(init?.headers).get("Authorization")).toBe("assembly-test-key");
  expect(url).toContain("expires_in_seconds=60");
  expect(url).toContain("max_session_duration_seconds=900");
  return json({ token: "assembly-token" });
};

async function seedUser(t: ReturnType<typeof convexTest>, mock: boolean) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
  if (mock) await t.run(async (ctx) => ctx.db.insert("userMockMode", { userId }));
  return userId;
}

describe("stt.stream.createStreamSession — free-launch access contract", () => {
  it("(a) !mock mints a real token without consuming credits", async () => {
    const t = setup();
    const userId = await seedUser(t, false);
    const { providerCalls } = stubFetch(deepgramGrant);

    const as = t.withIdentity({ subject: userId });
    const res = await as.action(api.stt.stream.createStreamSession, { provider: "deepgram" });

    expect(res).toEqual({ provider: "deepgram", mock: false, token: "tok-123" });
    expect(providerCalls.length).toBeGreaterThanOrEqual(1);
    const bal = await as.query(api.agent.credits.balance, {});
    expect(bal?.used).toBe(0);
  });

  it("(b) mock does NOT charge and does NOT call the provider", async () => {
    const t = setup();
    const userId = await seedUser(t, true);
    const { providerCalls } = stubFetch(deepgramGrant);

    const as = t.withIdentity({ subject: userId });
    const res = await as.action(api.stt.stream.createStreamSession, { provider: "deepgram" });

    expect(res).toEqual({ provider: "deepgram", mock: true, token: "" });
    expect(providerCalls).toHaveLength(0);
    const bal = await as.query(api.agent.credits.balance, {});
    expect(bal?.used).toBe(0);
  });

  it("(c) return shape: { provider, mock, token }", async () => {
    const t = setup();
    const userId = await seedUser(t, true);
    stubFetch(deepgramGrant);

    const res = await t
      .withIdentity({ subject: userId })
      .action(api.stt.stream.createStreamSession, { provider: "deepgram" });

    expect(Object.keys(res).sort()).toEqual(["mock", "provider", "token"]);
  });

  it("mints an AssemblyAI token without exposing or prefixing the server key", async () => {
    const t = setup();
    const userId = await seedUser(t, false);
    const { providerCalls } = stubFetch(assemblyGrant);

    const res = await t
      .withIdentity({ subject: userId })
      .action(api.stt.stream.createStreamSession, { provider: "assemblyai" });

    expect(res).toEqual({ provider: "assemblyai", mock: false, token: "assembly-token" });
    expect(providerCalls).toHaveLength(1);
  });
});

describe("stt.stream.saveStreamTranscript", () => {
  it("persists the live transcript and returns an acknowledgement", async () => {
    const t = setup();
    const userId = await seedUser(t, false);
    const as = t.withIdentity({ subject: userId });

    const result = await as.mutation(api.stt.stream.saveStreamTranscript, {
      provider: "assemblyai",
      text: "Hello from desktop",
      language: "en",
      durationMs: 12_500,
    });

    expect(result).toEqual({ saved: true });
    const rows = await t.run(async (ctx) => await ctx.db.query("sttTranscriptions").collect());
    expect(rows).toEqual([
      expect.objectContaining({
        userId,
        provider: "assemblyai",
        text: "Hello from desktop",
        language: "en",
        durationMs: 12_500,
        mode: "live",
      }),
    ]);
  });
});
