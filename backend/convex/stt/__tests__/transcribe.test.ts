// Characterization tests for the free-launch STT action.
//
// Both real and mocked calls bypass the commercial meter. A real call still
// reaches its provider; mock mode still returns a canned transcript.

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
  (
    import.meta as unknown as {
      glob: (p: string) => Record<string, () => Promise<unknown>>;
    }
  ).glob("../../**/*.ts"),
  "stt",
);

const setup = () => registerRateLimiter(convexTest(schema, modules));

beforeAll(() =>
  stubProviderKeys({
    DEEPGRAM_API_KEY: "test-key",
    ELEVENLABS_API_KEY: "test-key",
    OPENAI_API_KEY: "test-key",
  }),
);
afterAll(() => vi.unstubAllEnvs());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const deepgramOk = (url: string) =>
  url.includes("deepgram.com")
    ? json({
        results: {
          channels: [{ alternatives: [{ transcript: "hello world" }] }],
        },
      })
    : undefined;

async function seedUser(t: ReturnType<typeof convexTest>, mock: boolean) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
  if (mock) await t.run(async (ctx) => ctx.db.insert("userMockMode", { userId }));
  const audioStorageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" })),
  );
  return { userId, audioStorageId };
}

describe("stt.transcribe — free-launch access contract", () => {
  it("reports the configured batch STT provider for clients", async () => {
    const t = setup();

    await expect(t.query(api.stt.transcribe.configuration, {})).resolves.toEqual({
      configured: true,
      provider: "deepgram",
    });
  });

  it("honors STT_PROVIDER when a gate needs a specific configured provider", async () => {
    vi.stubEnv("STT_PROVIDER", "openai");
    const t = setup();

    await expect(t.query(api.stt.transcribe.configuration, {})).resolves.toEqual({
      configured: true,
      provider: "openai",
    });
  });

  it("reports unconfigured when STT_PROVIDER names a provider without a server key", async () => {
    vi.stubEnv("STT_PROVIDER", "assemblyai");
    const t = setup();

    await expect(t.query(api.stt.transcribe.configuration, {})).resolves.toEqual({
      configured: false,
      provider: null,
    });
  });

  it("reports a usable provider when the authenticated user enabled mock mode", async () => {
    vi.stubEnv("STT_PROVIDER", "assemblyai");
    const t = setup();
    const { userId } = await seedUser(t, true);

    await expect(
      t.withIdentity({ subject: userId }).query(api.stt.transcribe.configuration, {}),
    ).resolves.toEqual({
      configured: true,
      provider: "deepgram",
    });
  });

  it("(a) !mock calls the provider without consuming credits", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, false);
    const { providerCalls } = stubFetch(deepgramOk);

    const as = t.withIdentity({ subject: userId });
    const res = await as.action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "deepgram",
    });

    expect(res.text).toBe("hello world");
    expect(providerCalls.length).toBeGreaterThanOrEqual(1);
    const bal = await as.query(api.agent.credits.balance, {});
    expect(bal?.used).toBe(0);
  });

  it("(b) mock does NOT charge and does NOT call the provider", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, true);
    const { providerCalls } = stubFetch(deepgramOk);

    const as = t.withIdentity({ subject: userId });
    const res = await as.action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "deepgram",
    });

    expect(res.text).toContain("[Simulated transcript]");
    expect(res.text).toContain("stale smell");
    expect(res.text).toContain("old beer");
    expect(res.text).toContain("heat");
    expect(res.text).toContain("odor");
    expect(res.text).toContain("pickle");
    expect(res.text).toContain("ham");
    expect(providerCalls).toHaveLength(0);
    const bal = await as.query(api.agent.credits.balance, {});
    expect(bal?.used).toBe(0);
  });

  it("(c) return shape: { transcriptionId, text }", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, true);
    stubFetch(deepgramOk);

    const res = await t.withIdentity({ subject: userId }).action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "deepgram",
    });

    expect(Object.keys(res).sort()).toEqual(["text", "transcriptionId"]);
    expect(typeof res.transcriptionId).toBe("string");
    expect(typeof res.text).toBe("string");
  });

  it("accepts contentType and prefers it over the storage response header", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, false);
    let uploadedFile: { name: string; type: string } | undefined;

    stubFetch((url, init) => {
      if (!url.includes("api.openai.com/v1/audio/transcriptions")) return undefined;
      const file = (init?.body as FormData).get("file") as File;
      uploadedFile = { name: file.name, type: file.type };
      return json({ text: "webm transcript" });
    });

    const res = await t.withIdentity({ subject: userId }).action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "openai",
      contentType: "audio/webm",
    });

    expect(res.text).toBe("webm transcript");
    expect(uploadedFile).toEqual({ name: "audio.webm", type: "audio/webm" });
  });

  it("uses the shared ElevenLabs default in both metadata and the provider request", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, false);
    let submittedModel: FormDataEntryValue | null = null;

    stubFetch((url, init) => {
      if (!url.includes("api.elevenlabs.io/v1/speech-to-text")) return undefined;
      submittedModel = (init?.body as FormData).get("model_id");
      return json({ text: "elevenlabs transcript" });
    });

    const res = await t.withIdentity({ subject: userId }).action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "elevenlabs",
    });

    expect(submittedModel).toBe("scribe_v2");
    await expect(t.run(async (ctx) => await ctx.db.get(res.transcriptionId))).resolves.toEqual(
      expect.objectContaining({ model: "scribe_v2" }),
    );
  });

  it("deletes uploaded audio when retainAudio is false", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, true);
    stubFetch(deepgramOk);

    const res = await t.withIdentity({ subject: userId }).action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "deepgram",
      durationMs: 2_500,
      retainAudio: false,
    });

    expect(Object.keys(res).sort()).toEqual(["text", "transcriptionId"]);
    await expect(t.run(async (ctx) => await ctx.storage.get(audioStorageId))).resolves.toBeNull();
    const row = await t.run(async (ctx) => await ctx.db.get(res.transcriptionId));
    expect(row).toEqual(
      expect.objectContaining({
        durationMs: 2_500,
        audioSizeBytes: 3,
        audioRetained: false,
      }),
    );
  });

  it("retains uploaded audio when retainAudio is true", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, true);
    stubFetch(deepgramOk);

    const res = await t.withIdentity({ subject: userId }).action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "deepgram",
      retainAudio: true,
    });

    await expect(
      t.run(async (ctx) => (await ctx.storage.get(audioStorageId)) !== null),
    ).resolves.toBe(true);
    const row = await t.run(async (ctx) => await ctx.db.get(res.transcriptionId));
    expect(row).toEqual(expect.objectContaining({ audioSizeBytes: 3, audioRetained: true }));
  });

  it("deletes uploaded audio when metering rejects the request", async () => {
    const t = setup();
    const { audioStorageId } = await seedUser(t, false);

    await expect(
      t.action(api.stt.transcribe.transcribe, {
        audioStorageId,
        provider: "deepgram",
        retainAudio: false,
      }),
    ).rejects.toThrow();
    await expect(t.run(async (ctx) => await ctx.storage.get(audioStorageId))).resolves.toBeNull();
  });

  it("preserves contentType when posting a Deepgram upload", async () => {
    const t = setup();
    const { userId, audioStorageId } = await seedUser(t, false);
    let contentType: string | undefined;

    stubFetch((url, init) => {
      if (!url.includes("deepgram.com")) return undefined;
      contentType = (init?.headers as Record<string, string>)["Content-Type"];
      return json({
        results: {
          channels: [{ alternatives: [{ transcript: "hello webm" }] }],
        },
      });
    });

    const res = await t.withIdentity({ subject: userId }).action(api.stt.transcribe.transcribe, {
      audioStorageId,
      provider: "deepgram",
      contentType: "audio/webm",
    });

    expect(res.text).toBe("hello webm");
    expect(contentType).toBe("audio/webm");
  });
});
