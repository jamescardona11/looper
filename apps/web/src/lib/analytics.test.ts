import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  opt_out_capturing: vi.fn(),
  identify: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  getFeatureFlag: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthog }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics bootstrap", () => {
  it("does not load PostHog before consent", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    const { initPostHog } = await import("./analytics");

    initPostHog();
    await Promise.resolve();

    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("loads PostHog with the configured host after consent", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    localStorage.setItem("cookie-consent", "accepted");
    const { initPostHog } = await import("./analytics");

    initPostHog();

    await vi.waitFor(() => {
      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({ api_host: "https://eu.i.posthog.com" }),
      );
    });
  });
});
