// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { TranscriptionRecord } from "../../../contracts";
import type { TranscriptionListEntry } from "../transcription-list-policy";

const itemRender = vi.hoisted(() => vi.fn());

vi.mock("../components/TranscriptionItem", () => ({
  default: (props: unknown) => {
    itemRender(props);
    return <div data-testid="transcription-item-stub" />;
  },
}));

import { TranscriptionListRow } from "../components/transcription-list-entry";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const record: TranscriptionRecord = {
  id: "dictation-7",
  timestamp: "2026-08-16T12:00:00.000Z",
  text: "Row contract",
  audio_path: "",
  audio_available: false,
  status: "success",
  llm_cleaned: false,
  speech_model: "parakeet",
  word_count: 2,
  audio_duration_seconds: 0,
  synced: false,
};

afterEach(() => {
  cleanup();
  itemRender.mockClear();
});

describe("TranscriptionListRow", () => {
  test("passes action and presentation policy to the item without changing the row", () => {
    const actions = {
      onDelete: vi.fn(async () => undefined),
      onRestore: vi.fn(),
      onRetry: vi.fn(async () => undefined),
      onCancelRetry: vi.fn(async () => undefined),
      onRetryCleanup: vi.fn(async () => undefined),
      onUndoCleanup: vi.fn(async () => undefined),
    };
    const entry: TranscriptionListEntry = { type: "item", record };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <TranscriptionListRow
          index={3}
          entry={entry}
          pendingDeletionIds={new Set()}
          freshIds={new Set([record.id])}
          poofingIds={new Set([record.id])}
          retryingIds={new Set([record.id])}
          todayOnly
          reduceMotion={false}
          showLlmButtons
          shiftHeld
          showDate
          entryClassName={(fresh, poofing) =>
            `row-${String(fresh)}-${String(poofing)}`
          }
          {...actions}
        />
      </I18nProvider>,
    );

    const row = container.querySelector<HTMLElement>(
      '[data-transcription-entry-id="dictation-7"]',
    );
    expect(row?.className).toContain("row-true-true");
    expect(row?.tabIndex).toBe(-1);
    expect(screen.getByTestId("transcription-item-stub")).toBeTruthy();
    const props = itemRender.mock.calls[0]?.[0] as {
      isRetrying: boolean;
      showLlmButtons: boolean;
      shiftHeld: boolean;
      showDate: boolean;
      onDelete: unknown;
      onUndoLlm: unknown;
    };
    expect(props).toMatchObject({
      isRetrying: true,
      showLlmButtons: true,
      shiftHeld: true,
      showDate: true,
      onDelete: actions.onDelete,
      onUndoLlm: actions.onUndoCleanup,
    });
  });
});
