// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LibraryItem, TranscriptSegment } from "../../../../contracts";

const openFfmpegInstallHelp = vi.hoisted(() => vi.fn());

vi.mock("../../../../data/library", () => ({ openFfmpegInstallHelp }));

import { LibraryTranscriptPanel } from "../LibraryTranscriptPanel";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
    className,
  }: {
    data: unknown[];
    itemContent: (index: number, entry: unknown) => React.ReactNode;
    className: string;
  }) => (
    <div className={className}>
      {data.map((entry, index) => (
        <div key={index}>{itemContent(index, entry)}</div>
      ))}
    </div>
  ),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(() => {
  cleanup();
  openFfmpegInstallHelp.mockReset();
});

const completeItem = (overrides: Partial<LibraryItem> = {}): LibraryItem =>
  ({
    id: "item-1",
    kind: "import",
    name: "Transcript",
    status: { type: "complete" },
    ...overrides,
  }) as LibraryItem;

function renderPanel(overrides = {}) {
  const props = {
    item: completeItem(),
    showSegmentView: false,
    visibleSegments: [],
    segmentsVirtuosoRef: createRef<VirtuosoHandle>(),
    segmentsScrollerRef: { current: null },
    activeSegmentIndex: -1,
    normalizedSearchQuery: "",
    renderSegmentWords: vi.fn(() => null),
    renderHighlightedText: vi.fn((text: string) => text),
    activeSegmentMatch: -1,
    renderSpeakerChip: vi.fn(() => null),
    handleTimestampClick: vi.fn(),
    showStreaming: false,
    streamChunks: [],
    streamVirtuosoRef: createRef<VirtuosoHandle>(),
    activeStreamMatch: -1,
    importStatusText: "Importing...",
    transcriptAreaRef: createRef<HTMLTextAreaElement>(),
    transcriptDraft: "Draft text",
    setTranscriptDraft: vi.fn(),
    transcriptAvailable: true,
    ...overrides,
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <LibraryTranscriptPanel {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

describe("LibraryTranscriptPanel", () => {
  test("uses the broad editorial conversation anatomy for meetings", () => {
    const segment: TranscriptSegment = {
      start_ms: 132_000,
      end_ms: 136_000,
      text: "The transcript should read like a conversation.",
      speaker_id: "speaker-1",
    };
    const item = {
      id: "meeting-1",
      kind: "meeting",
      name: "Design review",
      status: { type: "complete" },
    } as LibraryItem;

    render(
      <I18nProvider i18n={i18n}>
        <LibraryTranscriptPanel
          documentMode
          item={item}
          showSegmentView
          visibleSegments={[{ segment, index: 0 }]}
          segmentsVirtuosoRef={createRef()}
          segmentsScrollerRef={{ current: null }}
          activeSegmentIndex={0}
          normalizedSearchQuery=""
          renderSegmentWords={() => null}
          renderHighlightedText={(text) => text}
          activeSegmentMatch={-1}
          renderSpeakerChip={() => <span>Ana</span>}
          handleTimestampClick={vi.fn()}
          showStreaming={false}
          streamChunks={[]}
          streamVirtuosoRef={createRef()}
          activeStreamMatch={-1}
          importStatusText=""
          transcriptAreaRef={createRef()}
          transcriptDraft=""
          setTranscriptDraft={vi.fn()}
          transcriptAvailable
        />
      </I18nProvider>,
    );

    const transcript = screen.getByTestId("meeting-transcript-document");
    const turn = screen.getByTestId("conversation-turn");

    expect(transcript.className).toContain("px-0");
    expect(transcript.style.height).toBe("");
    expect(turn.className).toContain("grid-cols-[56px_minmax(0,1fr)]");
    expect(turn.className).toContain("py-3");
    expect(turn.className).toContain("border-b");
    expect(turn.parentElement?.className).not.toContain("pb-1");
    expect(turn.className).toContain("transcript-segment-active");
    expect(screen.getByText("Ana").isConnected).toBe(true);
    expect(
      screen.getByText("The transcript should read like a conversation.")
        .isConnected,
    ).toBe(true);
  });

  test("activates timestamps with click, Enter, and Space", () => {
    const segment: TranscriptSegment = {
      start_ms: 5_000,
      end_ms: 7_000,
      text: "Hello",
    };
    const { props } = renderPanel({
      showSegmentView: true,
      visibleSegments: [{ segment, index: 0 }],
      activeSegmentIndex: 0,
      renderSegmentWords: vi.fn(() => <em>active words</em>),
    });
    const timestamp = screen.getByRole("button", { name: "0:05" });

    fireEvent.click(timestamp);
    fireEvent.keyDown(timestamp, { key: "Enter" });
    fireEvent.keyDown(timestamp, { key: " " });

    expect(props.handleTimestampClick.mock.calls).toEqual([
      [5_000],
      [5_000],
      [5_000],
    ]);
    expect(screen.getByText("active words").isConnected).toBe(true);
    expect(props.renderHighlightedText).not.toHaveBeenCalled();
  });

  test("shows actionable import errors and opens FFmpeg help", () => {
    openFfmpegInstallHelp.mockResolvedValue(undefined);
    renderPanel({
      item: completeItem({
        status: { type: "error", message: "ffmpeg executable not found" },
      }),
    });

    expect(screen.getByText("Import failed").isConnected).toBe(true);
    expect(
      screen.getByText("FFmpeg required for video imports.").isConnected,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "FFmpeg Help" }));
    expect(openFfmpegInstallHelp).toHaveBeenCalledOnce();
  });

  test("renders streaming, pending, and editable transcript states", () => {
    const streaming = renderPanel({ showStreaming: true });
    expect(screen.getByText("Transcribing...").isConnected).toBe(true);
    streaming.unmount();

    const pending = renderPanel({
      item: completeItem({ status: { type: "pending" } }),
      importStatusText: "Waiting for import",
    });
    expect(screen.getByText("Waiting for import").isConnected).toBe(true);
    pending.unmount();

    const editable = renderPanel();
    const textarea = screen.getByPlaceholderText(
      "Transcript will appear here.",
    );
    expect(textarea.className).toBe(
      "h-full w-full resize-none bg-transparent ui-text-body text-content-secondary leading-relaxed outline-hidden disabled:opacity-60 custom-scrollbar select-text pr-4 pt-2 pb-4",
    );
    fireEvent.change(textarea, { target: { value: "Updated" } });
    expect(editable.props.setTranscriptDraft).toHaveBeenCalledWith("Updated");
  });

  test("preserves the transcript document hierarchy before timestamp segments exist", () => {
    const onCopy = vi.fn();
    renderPanel({ documentMode: true, onCopy });

    expect(screen.getByText("Transcript").isConnected).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Original local transcript" })
        .isConnected,
    ).toBe(true);
    expect(screen.queryByTestId("library-transcript-scroll-fade")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  test("keeps the document header and copy action with timestamp segments", () => {
    const segment: TranscriptSegment = {
      start_ms: 5_000,
      end_ms: 7_000,
      text: "Timestamped transcript",
    };
    const onCopy = vi.fn();

    renderPanel({
      documentMode: true,
      showSegmentView: true,
      visibleSegments: [{ segment, index: 0 }],
      onCopy,
    });

    expect(
      screen.getByRole("heading", { name: "Original local transcript" })
        .isConnected,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  test("keeps the scroll fade in the library panel, not in the document", () => {
    renderPanel();

    expect(screen.getByTestId("library-transcript-scroll-fade")).toBeTruthy();
  });

  test("renders streamed chunks and marks only the active search result", () => {
    const renderHighlightedText = vi.fn((text: string, active: boolean) => (
      <span data-active={active || undefined}>{text}</span>
    ));
    renderPanel({
      showStreaming: true,
      streamChunks: ["First chunk", "Second chunk"],
      activeStreamMatch: 1,
      renderHighlightedText,
    });

    expect(
      screen.getByText("First chunk").getAttribute("data-active"),
    ).toBeNull();
    expect(screen.getByText("Second chunk").getAttribute("data-active")).toBe(
      "true",
    );
    expect(renderHighlightedText.mock.calls).toEqual([
      ["First chunk", false],
      ["Second chunk", true],
    ]);
  });
});
