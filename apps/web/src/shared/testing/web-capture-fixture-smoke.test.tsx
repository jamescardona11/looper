import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  apiKeys: { save: vi.fn(async () => undefined) },
  transcribe: vi.fn(async () => ({ text: "The stale smell of old beer lingers." })),
  isAvailable: true,
  stopTrack: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useApiKeys: () => state.apiKeys,
  useTranscribe: () => ({
    transcribe: state.transcribe,
    history: [],
    isAvailable: state.isAvailable,
    isLoading: false,
  }),
}));

import { WebCaptureFixtureSmoke } from "./web-capture-fixture-smoke";

class FakeMediaRecorder {
  mimeType = "audio/webm";
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["harvard audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

describe("WebCaptureFixtureSmoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    window.history.replaceState(null, "", "/");
    delete (window as unknown as Record<string, boolean>).__looperWebCaptureFixtureSmokeStarted;
    state.isAvailable = true;
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: state.stopTrack }],
        })),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stays off unless requested", () => {
    render(<WebCaptureFixtureSmoke />);

    expect(screen.queryByTestId("web-capture-fixture-smoke")).not.toBeInTheDocument();
    expect(state.transcribe).not.toHaveBeenCalled();
  });

  it("records browser microphone audio and publishes a successful Harvard STT report", async () => {
    window.history.replaceState(null, "", "/?webCaptureFixtureSmoke=1&webCaptureRecordMs=250");

    render(<WebCaptureFixtureSmoke />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(state.stopTrack).toHaveBeenCalledOnce();
    expect(state.transcribe).toHaveBeenCalledWith({
      blob: expect.any(Blob),
      type: "audio/webm",
      provider: "openai",
    });
    const report = JSON.parse(screen.getByTestId("web-capture-fixture-smoke").textContent ?? "");
    expect(report).toMatchObject({
      ok: true,
      status: "success",
      sourceMatched: true,
      text: "The stale smell of old beer lingers.",
    });
  });

  it("keeps the recorder open for the requested capture window", async () => {
    window.history.replaceState(null, "", "/?webCaptureFixtureSmoke=1&webCaptureRecordMs=250");

    render(<WebCaptureFixtureSmoke />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(state.transcribe).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(state.transcribe).toHaveBeenCalledOnce();
  });
});
