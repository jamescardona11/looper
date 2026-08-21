// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LibraryItem, MeetingDetails } from "../../../../types";

const details: MeetingDetails = {
  library_item_id: "capture-one",
  started_at: "2026-08-19T19:25:00Z",
  ended_at: "2026-08-19T19:53:34Z",
  notes: "",
  notes_revision: 0,
  summary: "Tres decisiones y un pendiente.",
  summary_status: "complete",
  summary_error: null,
  system_audio_enabled: false,
  recovered: false,
  calendar_context: null,
  note_markers: [],
  live_transcript: [],
};

vi.mock("../../queries", () => ({
  useMeetingDetails: () => ({ data: details, isLoading: false }),
  useAskMeeting: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateMeetingNotes: () => ({ mutate: vi.fn(), isPending: false }),
  useGenerateMeetingSummary: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../settings/models/local-llm-queries", () => ({
  useMeetingAiStatus: () => ({ data: { state: "ready" } }),
}));

vi.mock("../../player/useLibraryPlayer", () => ({
  useLibraryPlayer: () => ({
    audioDuration: 1_714,
    audioCurrentTime: 0,
    isPlaying: false,
    audioReady: true,
    audioError: null,
    playbackRate: 1,
    handlePlaybackRateStep: vi.fn(),
    handleRateScrubStart: vi.fn(),
    handleTogglePlayback: vi.fn(),
    handleScrubChange: vi.fn(),
    handleScrubStart: vi.fn(),
    handleScrubEnd: vi.fn(),
    handleTimestampClick: vi.fn(),
    scrubberMax: 1_714,
    scrubberValue: 0,
    scrubberPercent: 0,
    canDecreasePlaybackRate: true,
    canIncreasePlaybackRate: true,
  }),
}));

vi.mock("../../export/useLibraryExport", () => ({
  useLibraryExport: () => ({ isExporting: false, handleExport: vi.fn() }),
}));

vi.mock("../../../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("../../transcript/LibraryTranscriptPanel", () => ({
  LibraryTranscriptPanel: () => <div data-testid="transcript-panel" />,
}));

vi.mock("../LibraryDetailModals", () => ({
  LibraryDetailModals: () => null,
}));

import LibraryDetail from "../LibraryDetail";

const i18n = setupI18n();

function libraryItem(kind: LibraryItem["kind"]): LibraryItem {
  return {
    id: "capture-one",
    name: "Note 2026-08-19 14:25",
    status: { type: "complete" },
    created_at: "2026-08-19T19:25:00.000Z",
    tags: [],
    kind,
    audio_path: "/tmp/note.wav",
    source_path: "",
    store_original: false,
    duration_seconds: 1_714,
    file_size_bytes: 100,
    original_format: "wav",
    llm_cleanup_enabled: false,
    denoise_enabled: false,
    transcript: "Lo que dije durante media hora",
    segments: [{ start_ms: 0, end_ms: 900, text: "Lo que dije" }],
    speech_model: "parakeet",
    show_timestamps: true,
    detect_speakers: false,
    speakers: [],
  };
}

const renderDetail = (kind: LibraryItem["kind"]) =>
  render(
    <I18nProvider i18n={i18n}>
      <LibraryDetail
        item={libraryItem(kind)}
        models={[]}
        shiftHeld={false}
        followTimestamps={false}
        onFollowTimestampsChange={vi.fn()}
        onClose={vi.fn()}
        onContinueRecording={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        onUpdate={vi.fn().mockResolvedValue(libraryItem(kind))}
        onExport={vi.fn().mockResolvedValue(undefined)}
        availableTags={[]}
      />
    </I18nProvider>,
  );

beforeEach(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
afterEach(cleanup);

describe("LibraryDetail for a recorded note", () => {
  test("opens the same review document and chat as a meeting", () => {
    renderDetail("recording");

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "My notes",
      "Enhanced",
      "Transcript",
      "Moments",
    ]);
    expect(screen.getByText("Tres decisiones y un pendiente.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ask this recording…").isConnected).toBe(
      true,
    );
  });

  test("leaves an imported file with the plain transcript", () => {
    renderDetail("import");

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByPlaceholderText("Ask this recording…")).toBeNull();
    expect(screen.getByTestId("transcript-panel").isConnected).toBe(true);
  });
});
