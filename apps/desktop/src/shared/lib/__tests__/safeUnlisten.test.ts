import { describe, expect, test, vi } from "vitest";
import { safeUnlisten } from "../safeUnlisten";

describe("safeUnlisten", () => {
  test("absorbs an async bridge cleanup failure", async () => {
    const unlisten = vi.fn(
      () =>
        Promise.reject(new Error("window already closed")) as unknown as void,
    );

    safeUnlisten(unlisten);
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledOnce();
  });

  test("absorbs a synchronous bridge cleanup failure", () => {
    const unlisten = vi.fn(() => {
      throw new Error("bridge unavailable");
    });

    expect(() => safeUnlisten(unlisten)).not.toThrow();
  });
});
