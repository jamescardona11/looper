// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TranscriptionRecord } from "../../types";
import TranscriptionItem from "./components/TranscriptionItem";
import { TranscriptionListRow } from "./components/transcription-list-entry";
import { TranscriptionListSearchControls } from "./components/transcription-list-search-controls";
import { TranscriptionListViewport } from "./components/transcription-list-viewport";

vi.mock("../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("../settings/models-queries", () => ({
  useSpeechModels: () => ({ data: [] }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "common.undo": "UNDO-DISTINCT",
    "transcriptions.filter.sort": "SORT-HEADING-DISTINCT",
    "transcriptions.filter.when": "WHEN-HEADING-DISTINCT",
    "transcriptions.item.copy_transcription": "COPY-DISTINCT",
    "transcriptions.item.delete": "DELETE-DISTINCT",
    "transcriptions.item.error.default": "FAILURE-DISTINCT",
    "transcriptions.item.more_options": "MORE-DISTINCT",
    "transcriptions.item.play_audio": "PLAY-DISTINCT",
    "transcriptions.item.restore_original": "RESTORE-DISTINCT",
    "transcriptions.item.retry": "RETRY-DISTINCT",
    "transcriptions.item.retry_cleanup": "CLEANUP-DISTINCT",
    "transcriptions.item.deleted": "DELETED-DISTINCT",
    "transcriptions.list.empty.title": "EMPTY-TITLE-DISTINCT",
    "transcriptions.list.empty": "EMPTY-BODY-DISTINCT",
    "transcriptions.list.empty.dictate.title": "DICTATE-DISTINCT",
    "transcriptions.list.empty.dictate.detail": "SHORTCUT-DISTINCT",
    "transcriptions.list.empty.import.title": "IMPORT-DISTINCT",
    "transcriptions.list.empty.import.detail": "DROP-DISTINCT",
    "transcriptions.list.empty.import.formats": "FORMATS-DISTINCT",
    "transcriptions.list.filter.aria": "FILTER-DISTINCT",
    "transcriptions.list.no_results": "NO-RESULTS-DISTINCT",
    "transcriptions.list.search.aria": "SEARCH-FIELD-DISTINCT",
    "transcriptions.list.search.open": "SEARCH-OPEN-DISTINCT",
    "transcriptions.list.search.placeholder_short": "PLACEHOLDER-DISTINCT",
    "transcriptions.sort.longest": "LONGEST-DISTINCT",
    "transcriptions.sort.oldest": "OLDEST-DISTINCT",
    "transcriptions.sort.recent": "RECENT-DISTINCT",
    "transcriptions.sort.shortest": "SHORTEST-DISTINCT",
    "transcriptions.time.7d": "SEVEN-DAYS-DISTINCT",
    "transcriptions.time.any": "ANY-TIME-DISTINCT",
    "transcriptions.time.today": "TODAY-DISTINCT",
  },
});

const record: TranscriptionRecord = {
  id: "translated",
  timestamp: "2026-08-16T12:00:00.000Z",
  text: "Translated row",
  raw_text: "Original row",
  audio_path: "/tmp/translated.wav",
  audio_available: true,
  status: "success",
  llm_cleaned: true,
  speech_model: "parakeet",
  word_count: 2,
  audio_duration_seconds: 1,
  synced: false,
};

const translated = (child: React.ReactNode) => (
  <I18nProvider i18n={i18n}>{child}</I18nProvider>
);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("transcription translation contract", () => {
  test("uses catalog messages throughout item actions", () => {
    render(
      translated(
        <TranscriptionItem
          record={record}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
          onRetryLlm={vi.fn()}
          onUndoLlm={vi.fn()}
          showLlmButtons
        />,
      ),
    );
    expect(screen.getByRole("button", { name: "COPY-DISTINCT" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "MORE-DISTINCT" }));
    for (const label of [
      "PLAY-DISTINCT",
      "RETRY-DISTINCT",
      "CLEANUP-DISTINCT",
      "RESTORE-DISTINCT",
      "DELETE-DISTINCT",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  test("uses catalog messages in search, filters, empty, no-result, and undo states", () => {
    const { rerender } = render(
      translated(
        <TranscriptionListSearchControls
          query=""
          sort="recent"
          time="any"
          records={[]}
          focusRecordId={null}
          onQueryChange={vi.fn()}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "SEARCH-OPEN-DISTINCT" }),
    );
    expect(
      screen.getByRole("textbox", { name: "SEARCH-FIELD-DISTINCT" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "FILTER-DISTINCT" }));
    expect(screen.getByText("RECENT-DISTINCT")).toBeTruthy();
    expect(screen.getByText("SEVEN-DAYS-DISTINCT")).toBeTruthy();

    rerender(
      translated(
        <TranscriptionListViewport
          state={{ kind: "empty" }}
          shortcutKeys={["Fn"]}
          entries={[]}
          computeItemKey={() => "unused"}
          renderEntry={() => null}
        />,
      ),
    );
    expect(screen.getByText("EMPTY-TITLE-DISTINCT")).toBeTruthy();
    expect(screen.getByText("IMPORT-DISTINCT")).toBeTruthy();

    rerender(
      translated(
        <TranscriptionListViewport
          state={{ kind: "no-results", text: "missing" }}
          shortcutKeys={[]}
          entries={[]}
          computeItemKey={() => "unused"}
          renderEntry={() => null}
        />,
      ),
    );
    expect(screen.getByText("NO-RESULTS-DISTINCT")).toBeTruthy();

    rerender(
      translated(
        <TranscriptionListRow
          index={0}
          entry={{ type: "item", record }}
          pendingDeletionIds={new Set([record.id])}
          freshIds={new Set()}
          poofingIds={new Set()}
          retryingIds={new Set()}
          todayOnly={false}
          reduceMotion={false}
          showLlmButtons={false}
          shiftHeld={false}
          showDate={false}
          entryClassName={() => "transcription-entry"}
          onDelete={vi.fn()}
          onRestore={vi.fn()}
          onRetry={vi.fn()}
          onCancelRetry={vi.fn()}
          onRetryCleanup={vi.fn()}
          onUndoCleanup={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText("DELETED-DISTINCT")).toBeTruthy();
    expect(screen.getByRole("button", { name: "UNDO-DISTINCT" })).toBeTruthy();
  });
});
