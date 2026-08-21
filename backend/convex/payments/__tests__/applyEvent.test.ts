import { describe, expect, it } from "vitest";
import { applyPaymentEvent } from "../applyEvent";

describe("applyPaymentEvent", () => {
  it("skips effects and audit logging for a duplicate event", async () => {
    const calls: string[] = [];

    const outcome = await applyPaymentEvent({
      findExisting: async () => ({ id: "existing" }),
      applyEffects: async () => {
        calls.push("effects");
      },
      recordEvent: async () => {
        calls.push("record");
      },
    });

    expect(outcome).toBe("duplicate");
    expect(calls).toEqual([]);
  });

  it("applies every effect before recording the event", async () => {
    const calls: string[] = [];

    const outcome = await applyPaymentEvent({
      findExisting: async () => null,
      applyEffects: async () => {
        calls.push("effects");
      },
      recordEvent: async () => {
        calls.push("record");
      },
    });

    expect(outcome).toBe("processed");
    expect(calls).toEqual(["effects", "record"]);
  });

  it("does not record an event when its effects fail", async () => {
    let recorded = false;

    await expect(
      applyPaymentEvent({
        findExisting: async () => null,
        applyEffects: async () => {
          throw new Error("effect failed");
        },
        recordEvent: async () => {
          recorded = true;
        },
      }),
    ).rejects.toThrow("effect failed");

    expect(recorded).toBe(false);
  });
});
