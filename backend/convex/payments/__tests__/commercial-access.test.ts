import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../../test-support/meteredHarness";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = rerootModules(
  (
    import.meta as unknown as {
      glob: (path: string) => Record<string, () => Promise<unknown>>;
    }
  ).glob("../../**/*.ts"),
  "payments",
);

const disabledMessage =
  "Commercial billing is unavailable while Looper is free to use";

describe("commercial billing during the free launch", () => {
  it("rejects every public checkout and portal action before authenticating or charging", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.payments.stripe.createCheckoutSession, {
        tier: "pro",
        interval: "monthly",
        successUrl: "https://looper.local/success",
        cancelUrl: "https://looper.local/cancel",
      }),
    ).rejects.toThrow(disabledMessage);
    await expect(
      t.action(api.payments.stripe.createOneTimeCheckout, {
        pack: "credits_100",
        successUrl: "https://looper.local/success",
        cancelUrl: "https://looper.local/cancel",
      }),
    ).rejects.toThrow(disabledMessage);
    await expect(
      t.action(api.payments.stripe.createPortalSession, {
        returnUrl: "https://looper.local/settings",
      }),
    ).rejects.toThrow(disabledMessage);
    await expect(
      t.action(api.payments.polar.createCheckout, {
        productKey: "pro",
        successUrl: "https://looper.local/success",
      }),
    ).rejects.toThrow(disabledMessage);
    await expect(
      t.action(api.payments.polar.customerPortal, {}),
    ).rejects.toThrow(disabledMessage);
  });
});
