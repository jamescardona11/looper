// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LibraryItem } from "../../../../types";
import { HomeMeetingActivity } from "../HomeMeetingActivity";

const useLibraryItems = vi.fn();
vi.mock("../../queries", () => ({
  useLibraryItems: (...args: unknown[]) => useLibraryItems(...args),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const NAME_BY_KIND: Record<LibraryItem["kind"], string> = {
  meeting: "Design review",
  recording: "Voice memo",
  import: "Imported file",
};

const item = (kind: LibraryItem["kind"]): LibraryItem => ({
  id: `${kind}-1`,
  name: NAME_BY_KIND[kind],
  audio_path: "",
  source_path: "",
  store_original: false,
  status: { type: "complete" },
  duration_seconds: 120,
  file_size_bytes: 0,
  original_format: "wav",
  created_at: new Date().toISOString(),
  tags: [],
  llm_cleanup_enabled: false,
  denoise_enabled: false,
  speech_model: "local",
  show_timestamps: true,
  detect_speakers: true,
  kind,
});

afterEach(() => {
  cleanup();
  useLibraryItems.mockReset();
});

describe("HomeMeetingActivity", () => {
  test("lists meetings and notes together and opens the selected capture", () => {
    const meeting = item("meeting");
    useLibraryItems.mockReturnValue({
      data: {
        pages: [{ items: [meeting, item("recording"), item("import")] }],
      },
    });
    const onOpen = vi.fn();

    render(
      <I18nProvider i18n={i18n}>
        <HomeMeetingActivity isActive onOpen={onOpen} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Design review/ }));
    expect(onOpen).toHaveBeenCalledWith(meeting);
    // Una nota se graba igual que una reunión: entra. Un import no.
    expect(screen.getByText("Voice memo")).toBeTruthy();
    expect(screen.queryByText("Imported file")).toBeNull();
    expect(useLibraryItems).toHaveBeenCalledWith({ since_days: 1 }, true);
  });

  test("does not add an empty captures section", () => {
    useLibraryItems.mockReturnValue({ data: { pages: [{ items: [] }] } });
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <HomeMeetingActivity isActive onOpen={vi.fn()} />
      </I18nProvider>,
    );

    expect(container.childElementCount).toBe(0);
  });
});
