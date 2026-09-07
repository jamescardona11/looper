// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LibraryItem } from "../../../../contracts";
import LibraryCard from "../LibraryCard";
import type { LibraryCardProps } from "../library-card-model";

vi.mock("../../../../shared/hooks/useClickOutside", () => ({
  useClickOutside: vi.fn(),
}));

vi.mock("../../../../shared/ui/IntelligencePixel", () => ({
  IntelligencePixel: ({ active }: { active: boolean }) => (
    <span data-testid="intelligence-pixel" data-active={String(active)} />
  ),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const libraryItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "library-1",
  name: "Planning.wav",
  created_at: "2026-08-17T14:05:00.000Z",
  kind: "import",
  status: { type: "complete" },
  tags: ["planning"],
  audio_path: "/audio/planning.wav",
  source_path: "/imports/planning.wav",
  original_format: "wav",
  store_original: true,
  duration_seconds: 65,
  file_size_bytes: 1024,
  transcript: null,
  segments: null,
  words: null,
  llm_cleanup_enabled: false,
  denoise_enabled: false,
  show_timestamps: false,
  detect_speakers: true,
  speech_model: "parakeet",
  speakers: [{ id: "speaker-1", name: "Ana" }],
  ...overrides,
});

function cardProps(
  overrides: Partial<LibraryCardProps> = {},
): LibraryCardProps {
  return {
    item: libraryItem(),
    onOpen: vi.fn(),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    onClickTag: vi.fn(),
    editingNameId: null,
    editingNameDraft: "Planning",
    onStartNameEdit: vi.fn(),
    onChangeNameDraft: vi.fn(),
    onCommitNameEdit: vi.fn(),
    onCancelNameEdit: vi.fn(),
    onRetry: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    editingTagId: null,
    tagDraft: "",
    onStartTagEdit: vi.fn(),
    onChangeTagDraft: vi.fn(),
    onCommitTagAdd: vi.fn(),
    onCancelTagEdit: vi.fn(),
    shiftHeld: false,
    availableTags: ["planning", "follow-up"],
    ...overrides,
  };
}

function renderCard(
  overrides: Partial<LibraryCardProps> = {},
  translation = i18n,
) {
  const props = cardProps(overrides);
  const view = render(
    <I18nProvider i18n={translation}>
      <LibraryCard {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LibraryCard", () => {
  test("preserves the row anatomy, metadata and accessible opening", () => {
    const segments = [
      { start_ms: 0, end_ms: 1000, text: "First", speaker_id: "speaker-1" },
      { start_ms: 1000, end_ms: 3000, text: "Second", speaker_id: "speaker-2" },
    ];
    const { container, props } = renderCard({
      item: libraryItem({ segments }),
    });
    const row = screen.getByTestId("library-card-library-1");

    expect(row.className).toContain("min-h-16");
    expect(row.className).toContain("grid-cols-[44px_minmax(0,1fr)_auto]");
    expect(row.className).toContain("border-b");
    expect(container.querySelectorAll("svg rect")).toHaveLength(2);
    expect(screen.getByText("Planning wav")).toBeTruthy();
    expect(screen.getByText("1:05")).toBeTruthy();
    expect(screen.getByText("Imported")).toBeTruthy();
    expect(screen.getByText("1 speakers")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open Planning.wav" }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(props.onOpen).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "#planning" }));
    expect(props.onClickTag).toHaveBeenCalledWith("planning");
    expect(props.onOpen).toHaveBeenCalledTimes(2);
  });

  test("keeps the name editor isolated from row navigation", () => {
    const { props } = renderCard({
      editingNameId: "library-1",
    });
    const nameInput = screen.getByRole("textbox", {
      name: "Edit meeting name",
    });

    fireEvent.click(nameInput);
    fireEvent.change(nameInput, { target: { value: "Roadmap" } });
    fireEvent.keyDown(nameInput, { key: "Enter", isComposing: true });
    expect(props.onCommitNameEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(nameInput, { key: "Enter" });
    fireEvent.keyDown(nameInput, { key: "Escape" });
    fireEvent.blur(nameInput);
    expect(props.onChangeNameDraft).toHaveBeenCalledWith("Roadmap");
    expect(props.onCommitNameEdit).toHaveBeenCalledTimes(2);
    expect(props.onCancelNameEdit).toHaveBeenCalledOnce();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  test("keeps the tag editor isolated from row navigation", () => {
    const { props } = renderCard({
      editingTagId: "library-1",
      tagDraft: "follow-up",
    });
    const tagInput = screen.getByRole("textbox", { name: "New tag" });

    fireEvent.change(tagInput, { target: { value: "review" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    fireEvent.keyDown(tagInput, { key: "Escape" });
    fireEvent.blur(tagInput);
    expect(props.onChangeTagDraft).toHaveBeenCalledWith("review");
    expect(props.onCommitTagAdd).toHaveBeenCalledOnce();
    expect(props.onCancelTagEdit).toHaveBeenCalledTimes(2);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  test("uses the exact Lingui ids and routes menu actions", () => {
    const distinctive = setupI18n();
    distinctive.loadAndActivate({
      locale: "distinct",
      messages: {
        "library.card.rename": "DISTINCT RENAME",
        "library.card.retranscribe": "DISTINCT RETRANSCRIBE",
        "library.card.delete": "DISTINCT DELETE",
      },
    });
    const { props } = renderCard({}, distinctive);

    const moreOptions = screen.getByRole("button", { name: "More options" });
    expect(moreOptions.className).toContain("opacity-0");
    expect(moreOptions.className).toContain("group-hover:opacity-100");
    expect(moreOptions.className).toContain("group-focus-within:opacity-100");
    expect(moreOptions.getAttribute("aria-expanded")).toBe("false");

    fireEvent.focus(moreOptions);
    fireEvent.click(moreOptions);
    expect(moreOptions.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("DISTINCT RENAME")).toBeTruthy();
    expect(screen.getByText("DISTINCT RETRANSCRIBE")).toBeTruthy();
    expect(screen.getByText("DISTINCT DELETE")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "DISTINCT RENAME" }));
    expect(props.onStartNameEdit).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "DISTINCT RETRANSCRIBE" }),
    );
    expect(props.onRetry).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "DISTINCT DELETE" }));
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  test("renders processing progress and exposes cancel instead of retry", () => {
    const distinctive = setupI18n();
    distinctive.loadAndActivate({
      locale: "processing",
      messages: { "library.card.cancel": "DISTINCT CANCEL" },
    });
    const { container, props } = renderCard(
      {
        item: libraryItem({
          status: { type: "transcribing", progress: 1.4 },
          segments: null,
        }),
      },
      distinctive,
    );

    expect(screen.getByText("Transcribing…")).toBeTruthy();
    expect(
      container.querySelector<HTMLElement>("[style='width: 100%;']")?.style
        .width,
    ).toBe("100%");
    expect(screen.getByTestId("intelligence-pixel").dataset.active).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "DISTINCT CANCEL" }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  test("shift routes tags, context menu and overflow control to destructive actions", () => {
    const { props } = renderCard({ shiftHeld: true });
    const row = screen.getByTestId("library-card-library-1");

    fireEvent.click(screen.getByRole("button", { name: "#planning" }));
    expect(props.onRemoveTag).toHaveBeenCalledWith("planning");
    expect(props.onClickTag).not.toHaveBeenCalled();

    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(props.onDelete).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Rename")).toBeNull();
  });

  test("swallows rejected menu actions after reporting the failure", async () => {
    const failure = new Error("backend unavailable");
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const onDelete = vi.fn().mockRejectedValue(failure);
    renderCard({ onDelete });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() =>
      expect(report).toHaveBeenCalledWith(
        "Library item action failed:",
        failure,
      ),
    );
  });
});
