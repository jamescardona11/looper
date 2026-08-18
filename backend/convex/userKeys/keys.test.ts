import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { rerootModules, stubFetch } from "../../test-support/meteredHarness";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// Element of status's return array — keeps the .find/.map predicates typed
// against the real function shape rather than re-declaring fields here.
type StatusRow = NonNullable<FunctionReturnType<typeof api.userKeys.keys.status>>[number];

// This test lives in convex/userKeys/, so the glob keys come out as "../foo.ts"
// / "./bar.ts" — re-root them to the convex/-relative paths convex-test expects.
const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "userKeys",
);

// crypto.ts derives the AES key from env.BYOK_ENCRYPTION_SECRET, and env.ts
// snapshots process.env eagerly on first import. Set the secret before the first
// function invocation so encrypt/decrypt work (round-trip itself is covered in
// crypto.test.ts; here it backs saveKey/testKey end-to-end).
beforeAll(() => {
  process.env.BYOK_ENCRYPTION_SECRET = "test-secret-must-be-at-least-16-chars-long";
});

afterEach(() => vi.restoreAllMocks());

// A well-formed key per provider's looksValid sanity check.
const VALID_OPENAI = "sk-0123456789abcdefghij";

async function seedUser(t: ReturnType<typeof convexTest>): Promise<string> {
  return await t.run(async (ctx) => await ctx.db.insert("users", {}));
}

describe("userKeys.saveKey", () => {
  it("rejects a malformed key without writing a row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: "not-a-key" }),
    ).rejects.toThrow("That doesn't look like a OpenAI API key.");

    const status = await t.withIdentity({ subject: userId }).query(api.userKeys.keys.status, {});
    expect(status?.find((s: StatusRow) => s.provider === "openai")?.configured).toBe(false);
  });

  it("encrypts a valid key, stores it (never as plaintext), and reports configured", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const res = await t
      .withIdentity({ subject: userId })
      .action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });
    expect(res).toEqual({ ok: true });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("userApiKeys")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", userId as never).eq("provider", "openai"),
        )
        .first(),
    );
    expect(row).not.toBeNull();
    // Stored ciphertext+iv, not the plaintext key.
    expect(row?.ciphertext).toBeTruthy();
    expect(row?.iv).toBeTruthy();
    expect(row?.ciphertext).not.toBe(VALID_OPENAI);

    const status = await t.withIdentity({ subject: userId }).query(api.userKeys.keys.status, {});
    expect(status?.find((s: StatusRow) => s.provider === "openai")?.configured).toBe(true);
  });

  it("upserts: a second save replaces the row and clears any prior test result", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });
    const firstId = await t.run(async (ctx) =>
      ctx.db
        .query("userApiKeys")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", userId as never).eq("provider", "openai"),
        )
        .first(),
    );
    // Pretend an earlier test ran against this row.
    await t.run(async (ctx) =>
      ctx.db.patch(firstId!._id, { lastTestedAt: 1, lastTestOk: true, lastTestError: undefined }),
    );

    await as.action(api.userKeys.keys.saveKey, {
      provider: "openai",
      plaintext: "sk-aaaaaaaaaaaaaaaaaaaa",
    });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userApiKeys")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", userId as never).eq("provider", "openai"),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1); // upsert, not insert
    expect(rows[0]?._id).toBe(firstId!._id);
    expect(rows[0]?.lastTestedAt).toBeUndefined(); // prior test result cleared

    const status = await as.query(api.userKeys.keys.status, {});
    expect(status?.find((s: StatusRow) => s.provider === "openai")?.lastTestOk).toBeNull();
  });

  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI }),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("userKeys.clearKey", () => {
  it("deletes the caller's own provider row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });

    const res = await as.mutation(api.userKeys.keys.clearKey, { provider: "openai" });
    expect(res).toEqual({ ok: true });

    const status = await as.query(api.userKeys.keys.status, {});
    expect(status?.find((s: StatusRow) => s.provider === "openai")?.configured).toBe(false);
  });

  it("is a no-op (still ok) when no row exists for the provider", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const res = await t
      .withIdentity({ subject: userId })
      .mutation(api.userKeys.keys.clearKey, { provider: "anthropic" });
    expect(res).toEqual({ ok: true });
  });

  it("only clears the caller's row — another user's key for the same provider is untouched", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);

    // Owner stores an OpenAI key.
    await t
      .withIdentity({ subject: ownerId })
      .action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });

    // A different user clearing "openai" must not delete the owner's row
    // (clearKey is scoped to getAuthUserId — there is no shared-row path).
    await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.userKeys.keys.clearKey, { provider: "openai" });

    const ownerStatus = await t
      .withIdentity({ subject: ownerId })
      .query(api.userKeys.keys.status, {});
    expect(ownerStatus?.find((s: StatusRow) => s.provider === "openai")?.configured).toBe(true);
  });

  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.userKeys.keys.clearKey, { provider: "openai" })).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("userKeys.status", () => {
  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.userKeys.keys.status, {})).toBeNull();
  });

  it("reports every provider, configured only for the ones with a saved key", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });

    const status = await as.query(api.userKeys.keys.status, {});
    expect(status?.map((s: StatusRow) => s.provider)).toEqual(["openai", "anthropic", "google"]);

    const openai = status?.find((s: StatusRow) => s.provider === "openai");
    expect(openai?.configured).toBe(true);
    expect(openai?.label).toBe("OpenAI");
    expect(openai?.createdAt).toEqual(expect.any(Number));

    expect(status?.find((s: StatusRow) => s.provider === "anthropic")?.configured).toBe(false);
    expect(status?.find((s: StatusRow) => s.provider === "google")?.configured).toBe(false);
  });

  it("surfaces the last test result after testKey runs", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });
    stubFetch((url) =>
      url.includes("api.openai.com/v1/models") ? new Response("{}", { status: 200 }) : undefined,
    );
    await as.action(api.userKeys.keys.testKey, { provider: "openai" });

    const openai = (await as.query(api.userKeys.keys.status, {}))?.find(
      (s: StatusRow) => s.provider === "openai",
    );
    expect(openai?.lastTestOk).toBe(true);
    expect(openai?.lastTestedAt).toEqual(expect.any(Number));
    expect(openai?.lastTestError).toBeNull();
  });
});

describe("userKeys.testKey", () => {
  it("throws when no key is configured", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      t.withIdentity({ subject: userId }).action(api.userKeys.keys.testKey, { provider: "openai" }),
    ).rejects.toThrow("No key configured");
  });

  it("decrypts, hits the provider's models endpoint, and records a passing result", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });

    const { providerCalls } = stubFetch((url) =>
      url.includes("api.openai.com/v1/models")
        ? new Response(JSON.stringify({ data: [] }), { status: 200 })
        : undefined,
    );

    const res = await as.action(api.userKeys.keys.testKey, { provider: "openai" });
    expect(res).toEqual({ ok: true, error: null });

    // The provider endpoint was actually hit with the decrypted key.
    expect(providerCalls.some((u) => u.includes("api.openai.com/v1/models"))).toBe(true);

    // The result was persisted on the row, observable via _getEncrypted's row.
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("userApiKeys")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", userId as never).eq("provider", "openai"),
        )
        .first(),
    );
    expect(row?.lastTestOk).toBe(true);
    expect(row?.lastTestError).toBeUndefined();
  });

  it("records a failing result and the provider error when the endpoint rejects the key", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });

    stubFetch((url) =>
      url.includes("api.openai.com/v1/models")
        ? new Response("invalid api key", { status: 401 })
        : undefined,
    );

    const res = await as.action(api.userKeys.keys.testKey, { provider: "openai" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("OpenAI returned 401");

    const status = (await as.query(api.userKeys.keys.status, {}))?.find(
      (s: StatusRow) => s.provider === "openai",
    );
    expect(status?.lastTestOk).toBe(false);
    expect(status?.lastTestError).toContain("OpenAI returned 401");
  });

  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.userKeys.keys.testKey, { provider: "openai" })).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("internal _resolvePlaintextForUser decrypts back the saved key for its owner", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await t
      .withIdentity({ subject: userId })
      .action(api.userKeys.keys.saveKey, { provider: "openai", plaintext: VALID_OPENAI });

    const plaintext = await t.action(internal.userKeys.keys._resolvePlaintextForUser, {
      userId: userId as never,
      provider: "openai",
    });
    expect(plaintext).toBe(VALID_OPENAI);
  });
});
