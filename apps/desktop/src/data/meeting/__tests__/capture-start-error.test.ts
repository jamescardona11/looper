import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureStartError,
  CaptureStartError,
  showCaptureStartError,
} from "../capture-start-error";
import {
  startPromptedMeetingCapture,
  startCalendarMeetingCapture,
} from "../meeting-awareness";
import {
  startDefaultMeetingCapture,
  resumeCapture,
} from "../../library/meetings";
import { startNoteFromDock } from "../notetaking";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => {
  invoke.mockReset();
});

describe("capture start failures", () => {
  test.each([
    () => startPromptedMeetingCapture(),
    () => startCalendarMeetingCapture("event-1"),
    () => startDefaultMeetingCapture(),
    () => resumeCapture("recording-1"),
    () => startNoteFromDock(),
  ])(
    "preserves recovery metadata across every start gateway",
    async (start) => {
      invoke.mockRejectedValue({
        message: "Download a model to record.",
        recovery: "models",
      });
      await expect(start()).rejects.toBeInstanceOf(CaptureStartError);
      await expect(start()).rejects.toMatchObject({
        recovery: "models",
        message: "Download a model to record.",
      });
    },
  );

  test("unknown actions cannot become arbitrary Tauri commands", async () => {
    await showCaptureStartError({
      message: "Cannot start",
      recovery: "delete_all_data",
    });
    expect(invoke).toHaveBeenCalledWith("debug_show_toast", {
      toastType: "error",
      message: "Cannot start",
    });
  });

  test("model failures offer recovery in toasts too", async () => {
    await showCaptureStartError({
      message: "Download a model to record.",
      recovery: "models",
    });
    expect(invoke).toHaveBeenCalledWith("debug_show_toast", {
      toastType: "error",
      message: "Download a model to record.",
      action: "open_llm_cleanup_settings",
      actionLabel: "Get model",
    });
  });

  test("legacy strings and ordinary errors retain readable messages", () => {
    expect(captureStartError("Recording not found").message).toBe(
      "Recording not found",
    );
    expect(captureStartError(new Error("Unavailable")).message).toBe(
      "Unavailable",
    );
  });
});
