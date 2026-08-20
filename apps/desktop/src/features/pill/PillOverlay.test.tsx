// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import PillOverlay from "./PillOverlay";

const actions = vi.hoisted(() => ({
  beginOverlayDrag: vi.fn(() => Promise.resolve()),
  endOverlayDrag: vi.fn(() => Promise.resolve()),
  cancelEditAction: vi.fn(() => Promise.resolve()),
  cancelPendingInsertion: vi.fn(() => Promise.resolve()),
  cancelRecording: vi.fn(() => Promise.resolve()),
  chooseEditAction: vi.fn(() => Promise.resolve()),
  copy: vi.fn(),
  confirmPendingInsertion: vi.fn(() => Promise.resolve()),
  finishRecording: vi.fn(() => Promise.resolve()),
  hide: vi.fn(() => Promise.resolve()),
  setDictationLanguage: vi.fn(() => Promise.resolve()),
  setPreflightLanguageMenuOpen: vi.fn(() => Promise.resolve()),
  startDragging: vi.fn(() => Promise.resolve()),
  startDictationFromDock: vi.fn(() => Promise.resolve()),
  startNoteFromDock: vi.fn(() => Promise.resolve()),
  undoLastInsertion: vi.fn(() => Promise.resolve()),
}));

const pillState = vi.hoisted(() => ({
  pillStatus: "processing",
  spectrumBinsRef: { current: new Uint8Array(256) },
  lastSpectrumAtRef: { current: 0 },
  isErrorFlashing: false,
  isExpanded: true,
  expandedText: "Hola, esta es la nota capturada.",
  pillTone: "copy_result",
  usedScreenContext: false,
  isHovered: false,
  dismiss: vi.fn(),
}));

const overlayHitSize = vi.hoisted(() => ({
  report: vi.fn((_width: number, _height: number) => Promise.resolve()),
}));

vi.mock("./usePillState", () => ({
  usePillState: () => pillState,
}));

vi.mock("../../data/overlay", () => ({
  setPillHitSize: overlayHitSize.report,
}));

vi.mock("../../data/audio", () => ({
  cancelRecording: actions.cancelRecording,
  finishRecording: actions.finishRecording,
}));

vi.mock("../../data/dictation", () => ({
  beginOverlayDrag: actions.beginOverlayDrag,
  endOverlayDrag: actions.endOverlayDrag,
  getCapturePillPreferences: () =>
    Promise.resolve({
      presentation: "dock",
      dockPosition: "bottom_center",
      language: "es",
    }),
  onCapturePillPreferencesChanged: () => Promise.resolve(() => {}),
  setDictationLanguage: actions.setDictationLanguage,
  setPreflightLanguageMenuOpen: actions.setPreflightLanguageMenuOpen,
  startDictationFromDock: actions.startDictationFromDock,
}));

vi.mock("../../data/notetaking", () => ({
  startNoteFromDock: actions.startNoteFromDock,
}));

vi.mock("../../data/settings", () => ({
  getSettings: () =>
    Promise.resolve({
      language: "es",
      local_model: "parakeet",
      remote_speech_enabled: false,
      remote_speech_provider: "openai",
      remote_speech_endpoint: "",
      remote_speech_model: "auto",
      transcription_mode: "local",
    }),
}));

vi.mock("../../data/transcription", () => ({
  listModels: () =>
    Promise.resolve([
      {
        key: "parakeet",
        language_selection_mode: "auto_detect",
        supported_languages: [
          { code: "en", name: "English" },
          { code: "es", name: "Spanish" },
          { code: "pt", name: "Portuguese" },
          { code: "fr", name: "French" },
        ],
      },
    ]),
  retryTranscription: vi.fn(),
}));

vi.mock("../../data/insertion", () => ({
  cancelEditAction: actions.cancelEditAction,
  cancelPendingInsertion: actions.cancelPendingInsertion,
  chooseEditAction: actions.chooseEditAction,
  confirmPendingInsertion: actions.confirmPendingInsertion,
  getActiveModeRuleSuggestion: vi.fn(() => Promise.resolve(null)),
  undoLastInsertion: actions.undoLastInsertion,
}));

vi.mock("../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: actions.copy }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: actions.hide,
    startDragging: actions.startDragging,
  }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "pill.result.close": "Close result",
    "pill.result.copy": "Copy",
    "pill.result.no_textbox_hint": "Select a textbox first, or copy",
    "pill.rail.listening": "Listening",
    "pill.rail.finish_hint": "Release Fn to transcribe",
    "pill.rail.cancel": "Cancel recording",
    "pill.rail.done": "Done",
  },
});

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  actions.cancelEditAction.mockClear();
  actions.cancelPendingInsertion.mockClear();
  actions.cancelRecording.mockClear();
  actions.chooseEditAction.mockClear();
  actions.copy.mockClear();
  actions.confirmPendingInsertion.mockClear();
  actions.finishRecording.mockClear();
  actions.hide.mockClear();
  actions.setDictationLanguage.mockClear();
  actions.setPreflightLanguageMenuOpen.mockClear();
  actions.startDragging.mockClear();
  actions.beginOverlayDrag.mockClear();
  actions.endOverlayDrag.mockClear();
  actions.startDictationFromDock.mockClear();
  actions.startNoteFromDock.mockClear();
  actions.undoLastInsertion.mockClear();
  pillState.pillStatus = "processing";
  pillState.isExpanded = true;
  pillState.expandedText = "Hola, esta es la nota capturada.";
  pillState.pillTone = "copy_result";
  pillState.isHovered = false;
});

describe("PillOverlay result", () => {
  test("keeps failed insertion text available to copy or close", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    expect(screen.getByText("Select a textbox first, or copy")).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Hola, esta es la nota capturada.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(actions.copy).toHaveBeenCalledWith(
      "Hola, esta es la nota capturada.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close result" }));
    expect(actions.cancelPendingInsertion).toHaveBeenCalledTimes(1);
  });

  test("reports the drawn pill size so the native hit area follows it", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    // Sin esto la zona clicable la fijaban constantes en Rust, y dejaban de
    // coincidir con la píldora en cuanto cambiaba de estado.
    expect(overlayHitSize.report).toHaveBeenCalled();
    const call = overlayHitSize.report.mock.calls.at(-1);
    expect(call?.[0]).toBeGreaterThan(0);
    expect(call?.[1]).toBeGreaterThan(0);
  });

  test("does not render the processing rail over an expanded transcript", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    expect(screen.queryByText("Writing…")).toBeNull();
  });

  test("keeps preview acceptance and cancellation on their keyboard shortcuts", () => {
    pillState.pillTone = "preview";

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    fireEvent.keyDown(window, { key: "Enter" });
    expect(actions.confirmPendingInsertion).toHaveBeenCalledWith(
      "Hola, esta es la nota capturada.",
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(actions.cancelPendingInsertion).toHaveBeenCalledTimes(1);
  });

  test("maps numeric Selection Mode shortcuts to the same action", () => {
    pillState.pillTone = "action_select";

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    fireEvent.keyDown(window, { key: "3" });
    expect(actions.chooseEditAction).toHaveBeenCalledWith("ask", undefined);
  });

  test("does not keep the compact rail cancel control behind an expanded result", () => {
    pillState.isHovered = true;

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Close result" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Cancel recording" }),
    ).toBeNull();
  });

  test("grows the result card to keep a longer transcript visible", () => {
    pillState.expandedText =
      "bueno, acá estamos hablando, intentando entender cómo sean las cosas, la animación, la verdad, la luz perfecta.";

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const shell = document.querySelector<HTMLElement>(".ui-pill-shell");
    expect(shell?.style.height).toBe("172px");
    expect(document.body.textContent).toContain(pillState.expandedText);
  });

  test("caps very long transcripts inside the native overlay viewport", () => {
    pillState.expandedText = "Una frase extensa. ".repeat(80);

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const shell = document.querySelector<HTMLElement>(".ui-pill-shell");
    expect(shell?.style.height).toBe("220px");
  });

  test("shows successful insertion and undo in the same pill", () => {
    pillState.pillTone = "inserted_result";

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    expect(screen.getByText("Inserted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(actions.undoLastInsertion).toHaveBeenCalledTimes(1);
    expect(actions.cancelPendingInsertion).toHaveBeenCalledTimes(1);
  });

  test("turns a press into a drag only once the pointer travels", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    fireEvent.pointerDown(screen.getByText("Select a textbox first, or copy"), {
      button: 0,
      clientX: 40,
      clientY: 20,
    });
    expect(actions.beginOverlayDrag).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { clientX: 42, clientY: 21 });
    expect(actions.beginOverlayDrag).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { clientX: 60, clientY: 20 });
    expect(actions.beginOverlayDrag).toHaveBeenCalledTimes(1);
  });

  test("drags from a control too, and swallows the click it would have fired", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const copyButton = screen.getByRole("button", { name: "Copy" });
    fireEvent.pointerDown(copyButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 10 });
    expect(actions.beginOverlayDrag).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(window, { clientX: 40, clientY: 10 });
    fireEvent.click(copyButton);
    expect(actions.copy).not.toHaveBeenCalled();
  });

  test("a press that never travels still activates the control", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const copyButton = screen.getByRole("button", { name: "Copy" });
    fireEvent.pointerDown(copyButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    fireEvent.click(copyButton);

    expect(actions.beginOverlayDrag).not.toHaveBeenCalled();
    expect(actions.copy).toHaveBeenCalledTimes(1);
  });

  test("auto-dismisses after ten seconds while not hovered", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const autoDismiss = timeoutSpy.mock.calls.find(
      ([, delay]) => delay === 10_000,
    )?.[0];
    expect(autoDismiss).toBeTypeOf("function");
    if (typeof autoDismiss !== "function") {
      throw new Error("Expected the transcription result auto-dismiss timer");
    }
    await act(async () => autoDismiss());
    expect(actions.cancelPendingInsertion).toHaveBeenCalledTimes(1);
    timeoutSpy.mockRestore();
  });

  test("auto-dismisses even if hover state becomes stuck", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    pillState.isHovered = true;
    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const autoDismiss = timeoutSpy.mock.calls.find(
      ([, delay]) => delay === 10_000,
    )?.[0];
    expect(autoDismiss).toBeTypeOf("function");
    if (typeof autoDismiss !== "function") {
      throw new Error("Expected the transcription result auto-dismiss timer");
    }
    await act(async () => autoDismiss());
    expect(actions.cancelPendingInsertion).toHaveBeenCalledTimes(1);
    timeoutSpy.mockRestore();
  });

  test("uses the compact Signal Rail and finishes Dictation", () => {
    pillState.pillStatus = "listening";
    pillState.isExpanded = false;
    pillState.expandedText = "";
    pillState.pillTone = "default";
    pillState.isHovered = true;

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    expect(screen.getByText("Listening")).toBeTruthy();
    expect(screen.getByText(/Release Fn to transcribe/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cancel recording" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(actions.finishRecording).toHaveBeenCalledTimes(1);
  });

  test("keeps recording actions hidden until the native hover expands the rail", () => {
    pillState.pillStatus = "listening";
    pillState.isExpanded = false;
    pillState.expandedText = "";
    pillState.pillTone = "default";
    pillState.isHovered = false;

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const actionsContainer = container.querySelector("[data-signal-actions]");
    expect(actionsContainer?.className).toContain("max-w-0");
    expect(actionsContainer?.className).not.toContain(
      "group-hover/signal:max-w-[148px]",
    );
  });

  test("keeps the same window alive when recording is cancelled", () => {
    pillState.pillStatus = "listening";
    pillState.isExpanded = false;
    pillState.expandedText = "";
    pillState.pillTone = "default";
    pillState.isHovered = true;

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    const cancelButton = screen.getByRole("button", {
      name: "Cancel recording",
    });
    expect(cancelButton.closest("[data-tauri-drag-region]")).toBeNull();

    fireEvent.click(cancelButton);
    expect(actions.cancelRecording).toHaveBeenCalledTimes(1);
    expect(actions.hide).not.toHaveBeenCalled();
  });

  test("shows cancellation in the same compact Signal Rail", () => {
    pillState.pillStatus = "cancelled";
    pillState.isExpanded = false;
    pillState.expandedText = "";
    pillState.pillTone = "default";

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    expect(screen.getAllByText("Discarded")).toHaveLength(2);
    expect(screen.getByText("Nothing inserted")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Cancel recording" }),
    ).toBeNull();
  });

  test("renders the edge handle until native hover reveals the full dock", async () => {
    pillState.pillStatus = "idle";
    pillState.isExpanded = false;
    pillState.isHovered = false;

    const view = render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );
    await act(async () => {});

    expect(document.querySelector(".ui-sticky-launcher")).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Dictation controls" }),
    ).toBeNull();

    pillState.isHovered = true;
    view.rerender(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );
    const dock = screen.getByRole("group", { name: "Dictation controls" });
    expect(dock.className).toContain("ui-pill-shell");
    expect(dock.className).toContain("ui-capture-dock");
    expect(dock.className).toContain("w-[260px]");
    expect(
      screen.queryByRole("button", { name: "Move Dictation dock" }),
    ).toBeNull();
  });

  test("keeps the sticky language menu inside the expanded native window", async () => {
    pillState.pillStatus = "idle";
    pillState.isExpanded = false;
    pillState.isHovered = true;

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dictation language" }));
    await act(async () => {});

    const menu = screen.getByRole("menu");
    expect(menu.parentElement?.parentElement?.className).toContain("items-end");

    const menuContainer = menu.parentElement;
    if (!menuContainer) throw new Error("Expected language menu container");
    fireEvent.pointerLeave(menuContainer);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(actions.setPreflightLanguageMenuOpen).toHaveBeenCalledWith(false);
  });

  test("opens Dictation from the tray dock and keeps its language selector persistent", async () => {
    pillState.pillStatus = "preflight";
    pillState.isExpanded = false;

    render(
      <I18nProvider i18n={i18n}>
        <PillOverlay />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dictate Fn/ }));
    expect(actions.startDictationFromDock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Dictation language" }));
    await act(async () => {});
    const languageOptions = screen.getAllByRole("menuitemradio");
    expect(screen.getByText("Fn").className).toContain("text-[10px]");
    expect(languageOptions[0].className).toContain("text-[11px]");
    expect(languageOptions.map((option) => option.textContent)).toEqual([
      "Español",
      "English",
      "Português",
    ]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(actions.setDictationLanguage).toHaveBeenCalledWith("en");
    expect(actions.setPreflightLanguageMenuOpen).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    expect(actions.startNoteFromDock).toHaveBeenCalledTimes(1);
  });
});
