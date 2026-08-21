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

import type { LibraryItem, SpeechModel } from "../../../../types";
import LibraryRetranscribeModal from "../LibraryRetranscribeModal";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const model = (
  id: string,
  label: string,
  capabilities: string[],
): SpeechModel => ({
  id,
  key: id,
  label,
  description: `${label} description`,
  size_mb: 100,
  engine_id: "test",
  variant: "default",
  tags: [],
  capabilities,
  supported_languages: [{ code: "en", name: "English" }],
  remote: false,
  installed: true,
});

const capable = model("capable", "Capable", ["timestamps", "diarization"]);
const basic = model("basic", "Basic", []);

const item: LibraryItem = {
  id: "item-1",
  name: "Planning",
  status: { type: "complete" },
  created_at: "2026-08-16T12:00:00.000Z",
  tags: [],
  kind: "meeting",
  audio_path: "/tmp/audio.wav",
  source_path: "/tmp/source.wav",
  store_original: true,
  duration_seconds: 60,
  file_size_bytes: 100,
  original_format: "wav",
  llm_cleanup_enabled: false,
  denoise_enabled: false,
  speech_model: "capable",
  show_timestamps: true,
  detect_speakers: true,
};

afterEach(cleanup);

function renderModal(overrides = {}) {
  const props = {
    item,
    models: [capable, basic],
    onCancel: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <LibraryRetranscribeModal {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

describe("library retranscription modal", () => {
  test("keeps the overlay, panel, copy, and click boundaries", () => {
    const { props } = renderModal();
    const overlay = screen.getByRole("dialog");
    const panel = screen.getByText("Planning").closest("div.relative");

    expect(overlay.className).toBe(
      "fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-6 backdrop-blur-xs",
    );
    expect(panel?.className).toBe(
      "relative w-[440px] max-w-[92vw] rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep",
    );
    expect(screen.getByRole("heading", { name: "Retranscribe" }).id).toBe(
      "retranscribe-modal-title",
    );

    if (panel) fireEvent.click(panel);
    expect(props.onCancel).not.toHaveBeenCalled();
    fireEvent.click(overlay);
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  test("submits supported options and exposes pending state", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onConfirm = vi.fn().mockReturnValue(pending);
    renderModal({ onConfirm });

    const confirm = screen.getByRole("button", { name: "Retranscribe" });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      model_key: "capable",
      show_timestamps: true,
      detect_speakers: true,
    });
    expect(
      screen
        .getByRole("button", { name: "Retranscribing..." })
        .hasAttribute("disabled"),
    ).toBe(true);

    finish();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retranscribe" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  });

  test("clears unsupported options when the model changes", async () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Capable" }));
    fireEvent.click(screen.getByRole("option", { name: /Basic/ }));

    expect(
      screen
        .getByRole("switch", { name: "Show timestamps" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("switch", { name: "Show timestamps" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("switch", { name: "Detect speakers" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retranscribe" }));
    await waitFor(() =>
      expect(props.onConfirm).toHaveBeenCalledWith({
        model_key: "basic",
        show_timestamps: false,
        detect_speakers: false,
      }),
    );
  });

  test("shows the no-model warning and disables confirmation", () => {
    renderModal({ models: [] });

    expect(screen.getByText(/No models available/).textContent).toContain(
      "Settings -> Models",
    );
    expect(
      screen
        .getByRole("button", { name: "Retranscribe" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("keeps the established translation and accessibility message ids", () => {
    const translated = setupI18n();
    translated.loadAndActivate({
      locale: "contract",
      messages: {
        "library.retranscribe.title": "Volver a transcribir",
        "library.retranscribe.close": "Cerrar modal",
        "library.retranscribe.model": "Modelo local",
        "library.retranscribe.show_timestamps": "Mostrar marcas",
        "library.retranscribe.show_timestamps.aria": "Control de marcas",
        "library.retranscribe.detect_speakers": "Detectar voces",
        "library.retranscribe.detect_speakers.aria": "Control de voces",
        "library.retranscribe.cancel": "Cancelar cambio",
        "library.retranscribe.confirm": "Confirmar retranscripción",
      },
    });

    render(
      <I18nProvider i18n={translated}>
        <LibraryRetranscribeModal
          item={item}
          models={[capable]}
          onCancel={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Volver a transcribir" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar modal" })).toBeTruthy();
    expect(screen.getByText("Modelo local")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Control de marcas" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Control de voces" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cancelar cambio" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Confirmar retranscripción" }),
    ).toBeTruthy();
  });
});
