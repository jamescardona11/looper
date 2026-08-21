// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LibraryItem, LibraryItemPatch } from "../../../../contracts";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  export: vi.fn(),
  timestamp: vi.fn(),
  togglePlayback: vi.fn(),
}));

vi.mock("../../player/useLibraryPlayer", () => ({
  useLibraryPlayer: () => ({
    audioDuration: 42,
    audioCurrentTime: 0.25,
    isPlaying: false,
    audioReady: true,
    audioError: null,
    playbackRate: 1,
    handlePlaybackRateStep: vi.fn(),
    handleRateScrubStart: vi.fn(),
    handleTogglePlayback: mocks.togglePlayback,
    handleScrubChange: vi.fn(),
    handleScrubStart: vi.fn(),
    handleScrubEnd: vi.fn(),
    handleTimestampClick: mocks.timestamp,
    scrubberMax: 42,
    scrubberValue: 0.25,
    scrubberPercent: 1,
    canDecreasePlaybackRate: true,
    canIncreasePlaybackRate: true,
  }),
}));

vi.mock("../../export/useLibraryExport", () => ({
  useLibraryExport: () => ({
    isExporting: false,
    handleExport: mocks.export,
  }),
}));

vi.mock("../../../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: mocks.copy }),
}));

vi.mock("../../transcript/LibraryTranscriptPanel", () => ({
  LibraryTranscriptPanel: (props: {
    transcriptDraft: string;
    setTranscriptDraft: (value: string) => void;
    showSegmentView: boolean;
    activeSegmentIndex: number;
    normalizedSearchQuery: string;
  }) => (
    <textarea
      aria-label="TRANSCRIPT EDITOR DISTINCT"
      value={props.transcriptDraft}
      data-segments={String(props.showSegmentView)}
      data-active-segment={props.activeSegmentIndex}
      data-search={props.normalizedSearchQuery}
      onChange={(event) => props.setTranscriptDraft(event.target.value)}
    />
  ),
}));

vi.mock("../../transcript/TranscriptWords", () => ({
  TranscriptWords: () => <span data-testid="transcript-words" />,
}));

vi.mock("../../transcript/TranscriptSpeakerChip", () => ({
  TranscriptSpeakerChip: () => <span data-testid="speaker-chip" />,
}));

vi.mock("../../player/LibraryAudioFooter", () => ({
  LibraryAudioFooter: (props: {
    meetingId?: string;
    playerProps: { showTimestamps: boolean };
  }) => (
    <div
      data-testid="audio-footer"
      data-meeting-id={props.meetingId}
      data-timestamps={String(props.playerProps.showTimestamps)}
    />
  ),
}));

vi.mock("../../meeting/MeetingDocumentWorkspace", () => ({
  MeetingDocumentWorkspace: (props: {
    title: string;
    transcriptPanel: unknown;
  }) => (
    <section data-testid="meeting-workspace" data-title={props.title}>
      {props.transcriptPanel as ReactNode}
    </section>
  ),
}));

vi.mock("../LibraryDetailModals", () => ({
  LibraryDetailModals: (props: {
    showDeleteConfirm: boolean;
    showTranslations: boolean;
    showRetranscribe: boolean;
  }) => (
    <div
      data-testid="detail-modals"
      data-delete={String(props.showDeleteConfirm)}
      data-translation={String(props.showTranslations)}
      data-retranscribe={String(props.showRetranscribe)}
    />
  ),
}));

import LibraryDetail from "../LibraryDetail";

const i18n = setupI18n();
const messages = {
  "library.detail.back": "BACK DISTINCT",
  "library.detail.edit_name": "EDIT NAME DISTINCT",
  "library.detail.save_name": "SAVE NAME DISTINCT",
  "library.detail.rename": "RENAME DISTINCT",
  "library.modal.search.placeholder": "SEARCH PLACEHOLDER DISTINCT",
  "library.modal.search.aria": "SEARCH ARIA DISTINCT",
  "library.modal.search.clear": "CLEAR SEARCH DISTINCT",
  "library.detail.filter.aria": "FILTER DISTINCT",
  "library.detail.filter.all": "ALL SPEAKERS DISTINCT",
  "library.modal.copy": "COPY DISTINCT",
  "library.modal.export": "EXPORT DISTINCT",
  "library.detail.more_actions": "MORE DISTINCT",
  "library.translation.action": "TRANSLATE DISTINCT",
  "library.modal.retranscribe": "RETRANSCRIBE DISTINCT",
  "library.modal.delete": "DELETE DISTINCT",
  "library.detail.tags.add": "ADD TAG DISTINCT",
  "library.detail.tags.label": "TAG DISTINCT",
  "library.modal.tags.new_tag": "NEW TAG DISTINCT",
  "library.detail.speakers": "SPEAKERS DISTINCT",
  "library.detail.add_speaker": "ADD SPEAKER DISTINCT",
};

const segments = [
  { start_ms: 0, end_ms: 900, text: "First", speaker_id: "speaker-a" },
  { start_ms: 2_000, end_ms: 2_900, text: "Second", speaker_id: "speaker-b" },
];

function libraryItem(patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "library-one",
    name: "Planning session",
    status: { type: "complete" },
    created_at: "2026-08-16T12:00:00.000Z",
    tags: ["alpha"],
    kind: "import",
    audio_path: "/tmp/audio.wav",
    source_path: "/tmp/source.wav",
    store_original: true,
    duration_seconds: 42,
    file_size_bytes: 100,
    original_format: "wav",
    llm_cleanup_enabled: true,
    denoise_enabled: true,
    transcript: "Alpha transcript",
    segments,
    speech_model: "parakeet",
    show_timestamps: true,
    detect_speakers: true,
    speakers: [
      { id: "speaker-a", name: "Ada", color: "var(--speaker-a)" },
      { id: "speaker-b", name: "Ben", color: "var(--speaker-b)" },
    ],
    ...patch,
  };
}

function renderDetail(item = libraryItem(), overrides = {}) {
  const props = {
    item,
    models: [],
    shiftHeld: false,
    followTimestamps: false,
    onFollowTimestampsChange: vi.fn(),
    onClose: vi.fn(),
    onContinueRecording: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onUpdate: vi
      .fn<(patch: LibraryItemPatch) => Promise<LibraryItem>>()
      .mockResolvedValue(item),
    onExport: vi.fn().mockResolvedValue(undefined),
    availableTags: ["alpha", "beta"],
    ...overrides,
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <LibraryDetail {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

beforeEach(() => {
  i18n.loadAndActivate({ locale: "distinct", messages });
  mocks.copy.mockReset();
  mocks.export.mockReset().mockResolvedValue(undefined);
  mocks.timestamp.mockReset();
  mocks.togglePlayback.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LibraryDetail", () => {
  test("offers continuing a finished capture, and not one still working", () => {
    const onContinueRecording = vi.fn();
    const { rerender } = renderDetail(libraryItem({ kind: "recording" }), {
      onContinueRecording,
    });

    fireEvent.click(screen.getByRole("button", { name: "MORE DISTINCT" }));
    fireEvent.click(screen.getByText("Continue recording"));
    expect(onContinueRecording).toHaveBeenCalledTimes(1);

    // Continuar sobre algo que aún se transcribe dejaría el texto a medias
    // contra un audio que ya creció.
    rerender(
      <I18nProvider i18n={i18n}>
        <LibraryDetail
          {...{
            item: libraryItem({
              kind: "recording",
              status: { type: "transcribing", progress: 0.4 },
            }),
            models: [],
            shiftHeld: false,
            followTimestamps: false,
            onFollowTimestampsChange: vi.fn(),
            onClose: vi.fn(),
            onContinueRecording,
            onDelete: vi.fn(),
            onRetry: vi.fn().mockResolvedValue(undefined),
            onCancel: vi.fn(),
            onUpdate: vi.fn().mockResolvedValue(undefined),
            onExport: vi.fn().mockResolvedValue(undefined),
            availableTags: [],
          }}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText("Continue recording")).toBeNull();
  });

  test("preserves the header tree, classes, translations, copy and export wiring", () => {
    const { container } = renderDetail();
    const root = container.firstElementChild as HTMLDivElement;
    const header = root.firstElementChild as HTMLElement;

    expect(root.className).toBe("relative flex h-full w-full min-h-0 flex-col");
    expect(header.className).toBe(
      "shrink-0 border-b border-[var(--color-border-primary)] px-5 pt-1.5 pb-2",
    );
    expect(header.firstElementChild?.children).toHaveLength(6);
    expect(
      screen.getByRole("button", { name: "BACK DISTINCT" }).isConnected,
    ).toBe(true);
    expect(
      screen
        .getByRole("textbox", { name: "SEARCH ARIA DISTINCT" })
        .getAttribute("placeholder"),
    ).toBe("SEARCH PLACEHOLDER DISTINCT");

    fireEvent.click(screen.getByRole("button", { name: "COPY DISTINCT" }));
    expect(mocks.copy).toHaveBeenCalledWith("Alpha transcript");
    fireEvent.click(screen.getByRole("button", { name: "EXPORT DISTINCT" }));
    fireEvent.click(screen.getByRole("button", { name: "SRT" }));
    expect(mocks.export).toHaveBeenCalledWith("srt");
  });

  test("keeps rename, tags, speaker filtering and modal actions connected", async () => {
    const { props } = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "RENAME DISTINCT" }));
    const name = screen.getByRole("textbox", { name: "EDIT NAME DISTINCT" });
    fireEvent.change(name, { target: { value: "  Renamed meeting  " } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(props.onUpdate).toHaveBeenCalledWith({ name: "Renamed meeting" });

    fireEvent.click(screen.getByRole("button", { name: "ADD TAG DISTINCT" }));
    const tag = screen.getByPlaceholderText("NEW TAG DISTINCT");
    fireEvent.change(tag, { target: { value: "beta" } });
    fireEvent.keyDown(tag, { key: "Enter" });
    expect(props.onUpdate).toHaveBeenCalledWith({ tags: ["alpha", "beta"] });

    fireEvent.click(screen.getByRole("button", { name: "FILTER DISTINCT" }));
    fireEvent.click(screen.getByRole("button", { name: /Ben/ }));
    expect(
      screen
        .getByLabelText("TRANSCRIPT EDITOR DISTINCT")
        .getAttribute("data-segments"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "MORE DISTINCT" }));
    fireEvent.click(screen.getByRole("button", { name: "TRANSLATE DISTINCT" }));
    expect(
      screen.getByTestId("detail-modals").getAttribute("data-translation"),
    ).toBe("true");
  });

  test("debounces transcript persistence and ignores an obsolete draft", () => {
    vi.useFakeTimers();
    const first = libraryItem();
    const { props, rerender } = renderDetail(first);
    const editor = screen.getByLabelText("TRANSCRIPT EDITOR DISTINCT");
    fireEvent.change(editor, { target: { value: "Edited transcript" } });
    vi.advanceTimersByTime(599);
    expect(props.onUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(props.onUpdate).toHaveBeenCalledWith({
      transcript: "Edited transcript",
    });

    props.onUpdate.mockClear();
    fireEvent.change(editor, { target: { value: "Obsolete draft" } });
    rerender(
      <I18nProvider i18n={i18n}>
        <LibraryDetail
          {...props}
          item={libraryItem({ transcript: "External transcript" })}
        />
      </I18nProvider>,
    );
    vi.advanceTimersByTime(600);
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(
      (
        screen.getByLabelText(
          "TRANSCRIPT EDITOR DISTINCT",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("External transcript");
  });

  test("preserves global playback, timestamp and escape keyboard behavior", () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const { props } = renderDetail();
    fireEvent.keyDown(document.body, { key: " " });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(mocks.togglePlayback).toHaveBeenCalledOnce();
    expect(mocks.timestamp).toHaveBeenCalledWith(2_000);

    const search = screen.getByRole("textbox", {
      name: "SEARCH ARIA DISTINCT",
    });
    fireEvent.keyDown(search, { key: " " });
    expect(mocks.togglePlayback).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  test("keeps meeting workspace and dock identity wired", () => {
    renderDetail(libraryItem({ kind: "meeting" }));
    expect(
      screen.getByTestId("meeting-workspace").getAttribute("data-title"),
    ).toBe("Planning session");
    expect(
      screen.getByTestId("audio-footer").getAttribute("data-meeting-id"),
    ).toBe("library-one");
  });
});
