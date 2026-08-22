import { convexTest } from "convex-test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { rerootModules } from "../../../test-support/meteredHarness";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../../**/*.ts",
  ),
  "payments",
);

beforeAll(() => vi.stubEnv("REVENUECAT_API_KEY", "test-key"));
afterAll(() => vi.unstubAllEnvs());
afterEach(() => vi.restoreAllMocks());

describe("payments.revenueCat — sync ownership contract", () => {
  it("rejects an appUserId that does not belong to the authenticated user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const otherUserId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      t.withIdentity({ subject: userId }).action(api.payments.revenueCat.syncRevenueCatPurchase, {
        appUserId: otherUserId,
      }),
    ).rejects.toThrow("RevenueCat appUserId must match the authenticated user");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("syncs the authenticated user's own RevenueCat subscriber", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          subscriber: {
            entitlements: {
              pro: {
                expires_date: null,
                purchase_date: "2026-06-05T00:00:00Z",
                product_identifier: "pro_monthly",
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await t
      .withIdentity({ subject: userId })
      .action(api.payments.revenueCat.syncRevenueCatPurchase, {
        appUserId: userId,
      });

    const sub = await t.run(async (ctx) =>
      ctx.db
        .query("userSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    );
    expect(sub).toMatchObject({
      userId,
      source: "revenuecat",
      status: "active",
      revenueCatAppUserId: userId,
    });
  });
});
