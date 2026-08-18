import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(),
  history: [] as Array<{
    _id: string;
    provider: string;
    status: string;
    text?: string;
  }>,
}));

vi.mock("@looper/data", () => ({
  useTranscribe: () => ({
    transcribe: vi.fn(),
    history: mocks.history,
    isAvailable: true,
  }),
}));

vi.mock("@/features/transcribe/use-streaming-stt", () => ({
  useStreamingStt: () => ({
    transcript: "Live transcript ready to reuse.",
    isLive: true,
    status: "live",
    start: vi.fn(),
    stop: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/shared/components/audio-recorder", () => ({
  AudioRecorderButton: () => null,
}));

vi.mock("@/shared/components/voice-tool-nav", () => ({
  VoiceToolNav: () => null,
}));

import { TranscribePage } from "./transcribe-page";

beforeEach(() => {
  mocks.writeText.mockReset();
  mocks.writeText.mockResolvedValue(undefined);
  mocks.history.length = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(cleanup);

describe("TranscribePage", () => {
  it("uses a compact workspace once a transcript exists", () => {
    mocks.history.push({
      _id: "transcript_1",
      provider: "deepgram",
      status: "done",
      text: "A concise transcript.",
    });

    render(
      <I18nProvider defaultLocale="en">
        <TranscribePage />
      </I18nProvider>,
    );

    expect(screen.getByTestId("transcript-workspace")).toHaveClass("min-h-[260px]");
    expect(screen.getByTestId("transcript-workspace")).not.toHaveClass("min-h-[400px]");
  });

  it("copies the live transcript", async () => {
    render(
      <I18nProvider defaultLocale="en">
        <TranscribePage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith("Live transcript ready to reuse.");
    });
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeVisible();
  });
});
