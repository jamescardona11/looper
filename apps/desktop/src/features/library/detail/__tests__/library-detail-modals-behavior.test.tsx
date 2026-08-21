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

vi.mock("../../transcript/LibraryTranslationsModal", () => ({
  default: ({
    itemId,
    itemName,
    onClose,
  }: {
    itemId: string;
    itemName: string;
    onClose: () => void;
  }) => (
    <button onClick={onClose}>
      Translation {itemId} {itemName}
    </button>
  ),
}));

vi.mock("../../transcript/LibraryRetranscribeModal", () => ({
  default: ({
    onCancel,
    onConfirm,
  }: {
    onCancel: () => void;
    onConfirm: (options: {
      model_key: string;
      show_timestamps: boolean;
      detect_speakers: boolean;
    }) => Promise<void>;
  }) => (
    <div>
      <button onClick={onCancel}>Cancel retranscription</button>
      <button
        onClick={() =>
          void onConfirm({
            model_key: "parakeet-v3",
            show_timestamps: true,
            detect_speakers: true,
          })
        }
      >
        Confirm retranscription
      </button>
    </div>
  ),
}));

import { LibraryDetailModals } from "../LibraryDetailModals";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const item: LibraryItem = {
  id: "item-1",
  name: "Weekly sync",
  status: { type: "complete" },
  created_at: "2026-08-16T12:00:00.000Z",
  tags: [],
  kind: "meeting",
  audio_path: "/tmp/audio.wav",
  source_path: "/tmp/source.wav",
  store_original: true,
  duration_seconds: 60,
  file_size_bytes: 1_024,
  original_format: "wav",
  llm_cleanup_enabled: true,
  denoise_enabled: true,
  speech_model: "old-model",
  show_timestamps: false,
  detect_speakers: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderModals(overrides = {}) {
  const props = {
    item,
    models: [],
    showDeleteConfirm: false,
    setShowDeleteConfirm: vi.fn(),
    showTranslations: false,
    setShowTranslations: vi.fn(),
    showRetranscribe: false,
    setShowRetranscribe: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(item),
    ...overrides,
  };
  const parentClick = vi.fn();
  const view = render(
    <I18nProvider i18n={i18n}>
      <div onClick={parentClick}>
        <LibraryDetailModals {...props} />
      </div>
    </I18nProvider>,
  );
  return { ...view, parentClick, props };
}

describe("library detail modals", () => {
  test("keeps delete overlay, panel, copy, and actions unchanged", () => {
    const { props, parentClick } = renderModals({ showDeleteConfirm: true });
    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement as HTMLDivElement;

    expect(overlay.className).toBe(
      "fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs px-6",
    );
    expect(dialog.className).toBe(
      "w-full max-w-sm rounded-2xl border border-border-primary bg-surface-tertiary p-5 ui-shadow-modal-deep",
    );
    expect(screen.getByText("Delete this item?").isConnected).toBe(true);
    expect(
      screen.getByText(
        "This removes the transcript and audio from your library.",
      ).isConnected,
    ).toBe(true);

    fireEvent.click(dialog);
    expect(props.setShowDeleteConfirm).not.toHaveBeenCalled();
    fireEvent.click(overlay);
    expect(props.setShowDeleteConfirm).toHaveBeenCalledWith(false);
    expect(parentClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.setShowDeleteConfirm).toHaveBeenLastCalledWith(false);
  });

  test("passes translation identity and closes through the supplied setter", () => {
    const { props } = renderModals({ showTranslations: true });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Translation item-1 Weekly sync",
      }),
    );

    expect(props.setShowTranslations).toHaveBeenCalledWith(false);
  });

  test("updates, retries, and closes a successful retranscription", async () => {
    const { props } = renderModals({ showRetranscribe: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm retranscription" }),
    );

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith({
        speech_model: "parakeet-v3",
        llm_cleanup_enabled: false,
        denoise_enabled: true,
        show_timestamps: true,
        detect_speakers: true,
      }),
    );
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(props.setShowRetranscribe).toHaveBeenCalledWith(false);
  });

  test("logs a retranscription failure without retrying or closing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("write failed");
    const { props } = renderModals({
      showRetranscribe: true,
      onUpdate: vi.fn().mockRejectedValue(failure),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm retranscription" }),
    );

    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        "Failed to retranscribe:",
        failure,
      ),
    );
    expect(props.onRetry).not.toHaveBeenCalled();
    expect(props.setShowRetranscribe).not.toHaveBeenCalled();
  });
});
