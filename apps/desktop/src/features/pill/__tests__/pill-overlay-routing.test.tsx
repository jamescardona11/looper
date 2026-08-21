// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { MeetingCaptureState } from "../../../types";
import PillOverlay from "../PillOverlay";

vi.mock("../../library/components/MeetingCaptureOverlay", () => ({
  default: ({ state }: { state: MeetingCaptureState }) => (
    <output data-testid="meeting-capture">{state.id}</output>
  ),
}));

vi.mock("../pill-dictation-overlay", () => ({
  DictationPillOverlay: ({
    className,
    sensitivity,
  }: {
    className?: string;
    sensitivity?: number;
  }) => (
    <output data-testid="dictation-capture">
      {className}:{sensitivity}
    </output>
  ),
}));

afterEach(cleanup);

describe("PillOverlay routing", () => {
  test("forwards dictation presentation props when no meeting is active", () => {
    render(<PillOverlay className="preview" sensitivity={4} />);

    expect(screen.getByTestId("dictation-capture").textContent).toBe(
      "preview:4",
    );
    expect(screen.queryByTestId("meeting-capture")).toBeNull();
  });

  test("gives an active meeting exclusive ownership of the overlay", () => {
    const meeting: MeetingCaptureState = {
      phase: "recording",
      id: "meeting-42",
      elapsed_seconds: 12,
      system_audio_enabled: true,
      capture_intent: "meeting",
      live_transcript: "",
      capture_health: { status: "healthy", audio_lag_ms: 0 },
    };

    render(<PillOverlay meeting={meeting} className="ignored" />);

    expect(screen.getByTestId("meeting-capture").textContent).toBe(
      "meeting-42",
    );
    expect(screen.queryByTestId("dictation-capture")).toBeNull();
  });
});
