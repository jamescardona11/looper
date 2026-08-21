import { createActor } from "xstate";
import { describe, expect, test } from "vitest";
import {
  createOnboardingMachine,
  defaultSmartShortcutForPlatform,
  getSteps,
  onboardingMachine,
} from "../machine";
import type { OnboardingPlatform } from "../platform";

const platform = (
  id: OnboardingPlatform["id"],
  permissions: Partial<OnboardingPlatform> = {},
): OnboardingPlatform => ({
  id,
  requiresMicrophonePermission: false,
  requiresAccessibilityPermission: false,
  ...permissions,
});

const startMachine = (targetPlatform = platform("windows")) => {
  const actor = createActor(createOnboardingMachine(targetPlatform));
  actor.start();
  return actor;
};

const move = (
  actor: ReturnType<typeof startMachine>,
  events: Parameters<typeof actor.send>[0][],
) => {
  for (const event of events) actor.send(event);
  return actor.getSnapshot();
};

describe("defaultSmartShortcutForPlatform", () => {
  test("uses Fn on macOS", () => {
    expect(defaultSmartShortcutForPlatform(platform("macos"))).toBe("Fn");
  });

  test("uses Control+Space outside macOS", () => {
    expect(defaultSmartShortcutForPlatform(platform("windows"))).toBe(
      "Control+Space",
    );
  });
});

describe("getSteps", () => {
  test("orders import, model, intelligence, and permissions for local setup", () => {
    expect(
      getSteps(
        platform("macos", { requiresMicrophonePermission: true }),
        true,
        "local",
        true,
      ),
    ).toEqual(["mode", "import", "model", "intelligence", "permissions"]);
  });

  test("omits local-only steps in cloud mode", () => {
    expect(getSteps(platform("windows"), true, "cloud", true)).toEqual([
      "mode",
      "intelligence",
    ]);
  });
});

describe("onboardingMachine navigation", () => {
  test("uses the minimal local route and supports reverse navigation", () => {
    const actor = startMachine();
    expect(actor.getSnapshot().value).toBe("welcome");

    expect(move(actor, [{ type: "NEXT" }]).value).toBe("mode");
    expect(move(actor, [{ type: "NEXT" }]).value).toBe("model");
    expect(move(actor, [{ type: "NEXT" }]).value).toBe("done");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("model");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("mode");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("welcome");
  });

  test("includes import, intelligence, and permissions when enabled", () => {
    const actor = startMachine(
      platform("macos", { requiresAccessibilityPermission: true }),
    );
    const app = { id: "aqua", name: "Aqua Voice" } as never;

    expect(
      move(actor, [
        { type: "SET_IMPORTABLE", apps: [app] },
        { type: "SET_MEETING_AI_ACCESS", value: true },
        { type: "NEXT" },
        { type: "NEXT" },
      ]).value,
    ).toBe("import");
    expect(move(actor, [{ type: "NEXT" }]).value).toBe("model");
    expect(move(actor, [{ type: "NEXT" }]).value).toBe("intelligence");
    expect(move(actor, [{ type: "NEXT" }]).value).toBe("permissions");
    expect(move(actor, [{ type: "NEXT" }]).value).toBe("done");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("permissions");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("intelligence");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("model");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("import");
  });

  test("routes cloud mode directly through optional steps", () => {
    const actor = startMachine(
      platform("unsupported", { requiresMicrophonePermission: true }),
    );
    const snapshot = move(actor, [
      { type: "SELECT_MODE", mode: "cloud" },
      { type: "NEXT" },
      { type: "NEXT" },
    ]);

    expect(snapshot.value).toBe("permissions");
    expect(move(actor, [{ type: "BACK" }]).value).toBe("mode");
  });

  test("navigation resets transient feedback and records direction", () => {
    const actor = startMachine();
    const forward = move(actor, [
      { type: "SHOW_LOCAL_CONFIRM", show: true },
      { type: "COMPLETE_ERROR", error: "failed" },
      { type: "NEXT" },
    ]);

    expect(forward.context).toMatchObject({
      transitionDirection: 1,
      hasStepTransitioned: true,
      showLocalConfirm: false,
      completionError: null,
    });
    expect(move(actor, [{ type: "BACK" }]).context.transitionDirection).toBe(
      -1,
    );
  });
});

describe("onboardingMachine context events", () => {
  test("updates selections and clears the model when priority changes", () => {
    const actor = startMachine();
    const snapshot = move(actor, [
      { type: "SELECT_MODEL", key: "large" },
      { type: "SELECT_PRIORITY", priority: "compact" },
      { type: "SET_SHORTCUT", shortcut: "Alt+Space" },
      { type: "SET_AUTO_LAUNCH", value: true },
      { type: "SELECT_MEETING_AI", provider: "local" },
    ]);

    expect(snapshot.context).toMatchObject({
      localModelChoice: "",
      modelPriority: "compact",
      smartShortcut: "Alt+Space",
      autoLaunch: true,
      meetingAiChoice: "local",
    });
  });

  test("tracks completion and FAQ state", () => {
    const actor = startMachine();
    expect(
      move(actor, [
        { type: "COMPLETE_ERROR", error: "network" },
        { type: "COMPLETING" },
        { type: "TOGGLE_FAQ", show: true },
      ]).context,
    ).toMatchObject({
      completionError: null,
      isCompleting: true,
      showFAQModal: true,
    });

    expect(
      move(actor, [{ type: "COMPLETE_SUCCESS" }]).context.isCompleting,
    ).toBe(false);
  });
});

// Merged from the former tests/frontend/onboarding-machine.test.ts: that tree is
// reserved for cross-cutting contracts, and these exercise one module.
describe("onboarding transcription mode", () => {
  const macos = platform("macos", {
    requiresMicrophonePermission: true,
    requiresAccessibilityPermission: true,
  });

  test("local mode includes the model download step", () => {
    expect(getSteps(macos, false, "local")).toEqual([
      "mode",
      "model",
      "permissions",
    ]);
  });

  test("cloud mode skips model download and still requests permissions", () => {
    expect(getSteps(macos, false, "cloud")).toEqual(["mode", "permissions"]);
  });

  test("keeps an explicit local model selection", () => {
    const actor = createActor(onboardingMachine).start();

    actor.send({ type: "SELECT_MODEL", key: "cohere_transcribe_int4" });

    expect(actor.getSnapshot().context.localModelChoice).toBe(
      "cohere_transcribe_int4",
    );
    actor.stop();
  });
});
