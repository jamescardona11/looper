// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TranscriptionRecord } from "../../types";
import { currentTimePreset, parseTranscriptionSearch } from "./searchQuery";
import { TranscriptionListSearchControls } from "./components/transcription-list-search-controls";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const focusedRecord: TranscriptionRecord = {
  id: "focused",
  timestamp: "2026-08-16T12:00:00.000Z",
  text: "Focused transcript",
  audio_path: "",
  audio_available: false,
  status: "success",
  llm_cleaned: false,
  speech_model: "parakeet",
  word_count: 2,
  audio_duration_seconds: 0,
  synced: false,
};

function SearchHarness(props: { focusRecordId?: string | null }) {
  const [query, setQuery] = useState("");
  const parsed = parseTranscriptionSearch(query);
  return (
    <I18nProvider i18n={i18n}>
      <output data-testid="query-value">{query}</output>
      <TranscriptionListSearchControls
        query={query}
        sort={parsed.sort}
        time={currentTimePreset(parsed.after, parsed.before)}
        records={[focusedRecord]}
        focusRecordId={props.focusRecordId ?? null}
        onQueryChange={setQuery}
      />
    </I18nProvider>
  );
}

beforeEach(() => {
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

describe("transcription list search controls", () => {
  test("combines free text, sort, and time filters and clears on Escape", () => {
    render(<SearchHarness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Search transcriptions" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Search transcriptions",
    });
    fireEvent.change(input, { target: { value: "Project notes" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Sort and filter transcriptions" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Longest" }));
    expect(screen.getByTestId("query-value").textContent).toBe(
      "Project notes sort:longest",
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Past 7 days" }));
    const filtered = parseTranscriptionSearch(
      screen.getByTestId("query-value").textContent ?? "",
    );
    expect(filtered.sort).toBe("longest");
    expect(currentTimePreset(filtered.after, filtered.before)).toBe("7d");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByTestId("query-value").textContent).toBe("");
    expect(
      screen.getByRole("button", { name: "Search transcriptions" }),
    ).toBeTruthy();
  });

  test("opens a requested record once without overwriting later edits", () => {
    render(<SearchHarness focusRecordId="focused" />);
    const input = screen.getByRole("textbox", {
      name: "Search transcriptions",
    }) as HTMLInputElement;
    expect(input.value).toBe("Focused transcript");

    fireEvent.change(input, { target: { value: "Manual search" } });
    expect(input.value).toBe("Manual search");
    expect(screen.getByTestId("query-value").textContent).toBe("Manual search");
  });
});
