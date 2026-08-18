import { describe, expect, it } from "vitest";
import { isLaunchTarget, onboardingDestination } from "./launch";

describe("onboardingDestination", () => {
  it("launches the selected first outcome on shared access", () => {
    expect(onboardingDestination("chat", "free")).toEqual({ to: "/agent" });
    expect(onboardingDestination("voice", "free")).toEqual({ to: "/transcribe" });
  });

  it("takes BYOK users directly to API key setup", () => {
    expect(onboardingDestination("chat", "byok")).toEqual({
      to: "/settings",
      search: { tab: "keys" },
    });
  });
});

describe("isLaunchTarget", () => {
  it("accepts only the audio-first onboarding destinations", () => {
    expect(isLaunchTarget("/agent")).toBe(true);
    expect(isLaunchTarget("/transcribe")).toBe(true);
    expect(isLaunchTarget("/settings")).toBe(true);
    expect(isLaunchTarget("/talk")).toBe(false);
    expect(isLaunchTarget("/tts")).toBe(false);
  });
});
