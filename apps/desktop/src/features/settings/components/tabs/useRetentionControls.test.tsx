// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  previewAudio: vi.fn(),
  previewRecording: vi.fn(),
  previewTranscription: vi.fn(),
}));

vi.mock("../../../../data/transcription", () => ({
  previewAudioStorageBudget: mocks.previewAudio,
  previewRecordingPrune: mocks.previewRecording,
  previewTranscriptionPrune: mocks.previewTranscription,
}));

import { useRetentionControls } from "./useRetentionControls";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useRetentionControls", () => {
  test("previews an aggressive prune and commits only after confirmation", async () => {
    mocks.previewRecording.mockResolvedValue({ candidate_count: 2 });
    const setTarget = vi.fn();
    const setDuration = vi.fn();
    const { result } = renderHook(
      () =>
        useRetentionControls({
          autoDeleteTarget: "audio",
          onAutoDeleteTargetChange: setTarget,
          autoDeleteDuration: "never",
          onAutoDeleteDurationChange: setDuration,
          audioStorageBudgetMb: 1024,
          onAudioStorageBudgetMbChange: vi.fn(),
          pruneOptions: [{ value: "week", label: "A Week" }],
        }),
      { wrapper },
    );

    await act(() => result.current.applyAutoDeleteChange("audio", "week"));
    expect(mocks.previewRecording).toHaveBeenCalledWith("week");
    expect(result.current.pendingPruneConfirmation).toMatchObject({
      target: "audio",
      duration: "week",
      candidateCount: 2,
    });
    expect(setTarget).not.toHaveBeenCalled();

    act(() => result.current.handleConfirmPruneChange());
    expect(setTarget).toHaveBeenCalledWith("audio");
    expect(setDuration).toHaveBeenCalledWith("week");
  });

  test("uses a budget preview and preserves an unknown-impact confirmation", async () => {
    mocks.previewAudio.mockRejectedValue(new Error("preview unavailable"));
    const setBudget = vi.fn();
    const { result } = renderHook(
      () =>
        useRetentionControls({
          autoDeleteTarget: "audio",
          onAutoDeleteTargetChange: vi.fn(),
          autoDeleteDuration: "never",
          onAutoDeleteDurationChange: vi.fn(),
          audioStorageBudgetMb: 1024,
          onAudioStorageBudgetMbChange: setBudget,
          pruneOptions: [],
        }),
      { wrapper },
    );

    await act(() => result.current.applyAudioBudgetChange(512));
    expect(result.current.pendingBudgetConfirmation).toEqual({
      budgetMb: 512,
      candidateCount: null,
      candidateBytes: null,
    });
    expect(setBudget).not.toHaveBeenCalled();

    act(() => result.current.handleConfirmBudgetChange());
    expect(setBudget).toHaveBeenCalledWith(512);
  });
});
