import { describe, expect, test, vi } from "vitest";

import {
  classifyError,
  createFrontendCrashReporter,
  fingerprintCrash,
} from "../frontend-crash";

describe("frontend crash reporting", () => {
  test("deduplicates each source and fingerprint pair", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const report = createFrontendCrashReporter({
      disabled: false,
      getWindowLabel: () => "main",
      send,
    });
    const error = new TypeError("broken");

    report("render", error);
    report("render", error);
    report("window_error", error);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: "window_error",
        errorKind: "TypeError",
      }),
    );
  });

  test("does not inspect or publish crashes while disabled", () => {
    const getWindowLabel = vi.fn();
    const send = vi.fn();
    const report = createFrontendCrashReporter({
      disabled: true,
      getWindowLabel,
      send,
    });

    report("render", new Error("preview"));
    expect(getWindowLabel).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test("produces stable fingerprints and conservative error kinds", () => {
    const error = new Error("same");
    error.stack = "stack";
    expect(fingerprintCrash(error, "component")).toBe(
      fingerprintCrash(error, "component"),
    );
    expect(fingerprintCrash(error, "other")).not.toBe(
      fingerprintCrash(error, "component"),
    );
    expect(classifyError(error)).toBe("Error");
    expect(classifyError({ name: "Error" })).toBe("unknown");
  });
});
