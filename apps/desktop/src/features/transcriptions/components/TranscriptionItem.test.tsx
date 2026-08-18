// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TranscriptionRecord } from "../../../types";

import TranscriptionItem from "./TranscriptionItem";

const mocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset:///${path}`),
  copy: vi.fn(),
  useSpeechModels: vi.fn(),
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: ({ message }: { message: string }) => message,
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => mocks.convertFileSrc(path),
}));

vi.mock("../../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: mocks.copy }),
}));

vi.mock("../../settings/models-queries", () => ({
  resolveSpeechModelLabel: () => null,
  useSpeechModels: () => mocks.useSpeechModels(),
}));

class MockAudio {
  paused = true;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    this.paused = false;
    this.onplay?.();
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.onpause?.();
  });

  constructor(public src: string) {}
}

const record = (
  overrides: Partial<TranscriptionRecord> = {},
): TranscriptionRecord => ({
  id: "dictation-1",
  timestamp: "2026-08-10T12:00:00.000Z",
  text: "The recording's transcript.",
  audio_path: "/tmp/dictation-1.wav",
  audio_available: true,
  status: "success",
  llm_cleaned: false,
  speech_model: "parakeet",
  word_count: 3,
  audio_duration_seconds: 1,
  synced: false,
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.useSpeechModels.mockReturnValue({ data: [] });
});

afterEach(() => {
  cleanup();
  mocks.convertFileSrc.mockClear();
  mocks.copy.mockClear();
  mocks.useSpeechModels.mockReset();
  vi.unstubAllGlobals();
});

describe("TranscriptionItem", () => {
  test("reproduces the stored recording instead of reading the transcript aloud", () => {
    vi.stubGlobal("Audio", MockAudio);

    render(
      <TranscriptionItem
        record={record()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More options" }));

    expect(screen.getByText("Play audio")).toBeTruthy();
    expect(screen.queryByText("Read aloud")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));

    expect(mocks.convertFileSrc).toHaveBeenCalledWith("/tmp/dictation-1.wav");
    expect(screen.getByText("Pause audio")).toBeTruthy();
  });

  test("routes retry and delete actions with the record id", () => {
    const onRetry = vi.fn(async () => undefined);
    const onDelete = vi.fn(async () => undefined);
    render(
      <TranscriptionItem
        record={record({
          status: "error",
          error_message: "Engine unavailable",
        })}
        onDelete={onDelete}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith("dictation-1");

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("dictation-1");
  });

  test("keeps cleanup, restore, direct delete, and retry cancellation wired", () => {
    const onRetryLlm = vi.fn(async () => undefined);
    const onUndoLlm = vi.fn(async () => undefined);
    const onDelete = vi.fn(async () => undefined);
    const onCancelRetry = vi.fn(async () => undefined);
    const { rerender } = render(
      <TranscriptionItem
        record={record({ llm_cleaned: true, raw_text: "Raw transcript" })}
        onDelete={onDelete}
        onRetry={vi.fn()}
        onRetryLlm={onRetryLlm}
        onUndoLlm={onUndoLlm}
        showLlmButtons
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));
    expect(onRetryLlm).toHaveBeenCalledWith("dictation-1");

    rerender(
      <TranscriptionItem
        key="restore"
        record={record({ llm_cleaned: true, raw_text: "Raw transcript" })}
        onDelete={onDelete}
        onRetry={vi.fn()}
        onCancelRetry={onCancelRetry}
        onRetryLlm={onRetryLlm}
        onUndoLlm={onUndoLlm}
        showLlmButtons
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore original transcript" }),
    );
    expect(onUndoLlm).toHaveBeenCalledWith("dictation-1");

    rerender(
      <TranscriptionItem
        key="retrying"
        record={record({ llm_cleaned: true, raw_text: "Raw transcript" })}
        onDelete={onDelete}
        onRetry={vi.fn()}
        onCancelRetry={onCancelRetry}
        onRetryLlm={onRetryLlm}
        onUndoLlm={onUndoLlm}
        showLlmButtons
        isRetrying
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop transcription" }));
    expect(onCancelRetry).toHaveBeenCalledWith("dictation-1");

    rerender(
      <TranscriptionItem
        key="direct-delete"
        record={record()}
        onDelete={onDelete}
        onRetry={vi.fn()}
        shiftHeld
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("dictation-1");
  });
});
