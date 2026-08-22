import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = rerootModules(
  (
    import.meta as unknown as {
      glob: (p: string) => Record<string, () => Promise<unknown>>;
    }
  ).glob("../**/*.ts"),
  "",
);

describe("waitlist", () => {
  it("normalizes email, joins idempotently, and reports count/status", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.waitlist.waitlist.join, {
      email: " ADA@EXAMPLE.TEST ",
    });
    const again = await t.mutation(api.waitlist.waitlist.join, {
      email: "ada@example.test",
    });

    expect(again).toEqual({
      referralCode: first.referralCode,
      alreadyJoined: true,
    });
    expect(await t.query(api.waitlist.waitlist.count, {})).toBe(1);
    expect(
      await t.query(api.waitlist.waitlist.statusByCode, {
        referralCode: first.referralCode,
      }),
    ).toEqual({
      referralCode: first.referralCode,
      referralCount: 0,
      position: 1,
    });
  });

  it("credits a valid referrer and ignores invalid/self referrals", async () => {
    const t = convexTest(schema, modules);

    const referrer = await t.mutation(api.waitlist.waitlist.join, {
      email: "grace@example.test",
    });
    await t.mutation(api.waitlist.waitlist.join, {
      email: "hopper@example.test",
      referredBy: referrer.referralCode,
    });
    await t.mutation(api.waitlist.waitlist.join, {
      email: "unknown@example.test",
      referredBy: "missing",
    });
    await t.mutation(api.waitlist.waitlist.join, {
      email: "self@example.test",
    });

    const referrerStatus = await t.query(api.waitlist.waitlist.statusByCode, {
      referralCode: referrer.referralCode,
    });

    expect(referrerStatus?.referralCount).toBe(1);
    expect(await t.query(api.waitlist.waitlist.count, {})).toBe(4);
  });

  it("rejects invalid emails and returns null for unknown status codes", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.waitlist.waitlist.join, {
        email: "not-an-email",
      }),
    ).rejects.toThrow("Enter a valid email");
    expect(
      await t.query(api.waitlist.waitlist.statusByCode, {
        referralCode: "missing",
      }),
    ).toBeNull();
  });
});
