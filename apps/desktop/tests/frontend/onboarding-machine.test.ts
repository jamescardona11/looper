import { describe, expect, test } from "vitest";
import { createActor } from "xstate";
import {
  getSteps,
  onboardingMachine,
} from "../../src/features/onboarding/machine";

const platform = {
  id: "macos" as const,
  requiresMicrophonePermission: true,
  requiresAccessibilityPermission: true,
};

describe("desktop onboarding transcription mode", () => {
  test("local includes the Parakeet model step", () => {
    expect(getSteps(platform, false, "local")).toEqual([
      "mode",
      "model",
      "permissions",
    ]);
  });

  test("cloud skips model download and still requests permissions", () => {
    expect(getSteps(platform, false, "cloud")).toEqual(["mode", "permissions"]);
  });

  test("keeps the user's explicit Cohere selection", () => {
    const actor = createActor(onboardingMachine).start();

    actor.send({
      type: "SELECT_MODEL",
      key: "cohere_transcribe_int4",
    });

    expect(actor.getSnapshot().context.localModelChoice).toBe(
      "cohere_transcribe_int4",
    );
    actor.stop();
  });
});
