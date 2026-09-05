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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ToastPayload } from "../../../contracts";
import ToastOverlay from "../ToastOverlay";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: ToastPayload }) => void>(),
  invoke: vi.fn(() => Promise.resolve()),
  hide: vi.fn(() => Promise.resolve()),
  rendererReady: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../data/capture/toast", () => ({
  subscribeToastShow: vi.fn((handler: (payload: ToastPayload) => void) => {
    mocks.listeners.set("toast:show", ({ payload }) => handler(payload));
    return Promise.resolve(() => mocks.listeners.delete("toast:show"));
  }),
  subscribeToastHide: vi.fn((handler: () => void) => {
    mocks.listeners.set("toast:hide", handler);
    return Promise.resolve(() => mocks.listeners.delete("toast:hide"));
  }),
  setToastInteractive: mocks.invoke,
  hideToastWindow: mocks.hide,
  notifyToastRendererReady: mocks.rendererReady,
  runToastAction: mocks.invoke,
}));
vi.mock("../../../data/capture/audio", () => ({
  subscribeRecordingStart: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("../../../data/transcription", () => ({
  retryTranscription: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../../data/capture/insertion", () => ({
  undoLastInsertion: vi.fn(() => Promise.resolve()),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const renderOverlay = async () => {
  render(
    <I18nProvider i18n={i18n}>
      <ToastOverlay />
    </I18nProvider>,
  );
  await act(async () => Promise.resolve());
};

const showToast = (payload: ToastPayload) => {
  act(() => mocks.listeners.get("toast:show")?.({ payload }));
};

describe("ToastOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.listeners.clear();
    mocks.invoke.mockClear();
    mocks.hide.mockClear();
    mocks.rendererReady.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("replaces the current notification instead of stacking", async () => {
    await renderOverlay();
    showToast({ type: "info", message: "Recovering your last recording..." });
    showToast({
      type: "warning",
      message: "No words detected. Recording deleted.",
    });

    expect(
      screen.getByText("Recovering your last recording...").closest("section")
        ?.className,
    ).toContain("animate-toast-out");
    expect(
      screen.queryByText("No words detected. Recording deleted."),
    ).toBeNull();

    act(() => vi.advanceTimersByTime(120));
    expect(screen.queryByText("Recovering your last recording...")).toBeNull();
    expect(
      screen.getByText("No words detected. Recording deleted.").isConnected,
    ).toBe(true);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  test("marks the renderer ready only after every toast listener is installed", async () => {
    await renderOverlay();

    expect(mocks.listeners.has("toast:show")).toBe(true);
    expect(mocks.listeners.has("toast:hide")).toBe(true);
    expect(mocks.rendererReady).toHaveBeenCalledOnce();
  });

  test("uses alert only for errors and status for other notifications", async () => {
    await renderOverlay();
    showToast({ type: "error", message: "Microphone unavailable" });
    showToast({ type: "success", message: "Saved" });

    expect(screen.getByRole("alert").textContent).toContain(
      "Microphone unavailable",
    );
    act(() => vi.advanceTimersByTime(120));
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });

  test("uses readable overlay text and omits an empty action row", async () => {
    await renderOverlay();
    showToast({ type: "info", message: "Processing" });

    const message = screen.getByText("Processing");
    expect(message.className).toContain("text-[var(--ui-capture-fg-strong)]");
    expect(message.parentElement?.children).toHaveLength(1);

    const close = screen.getByRole("button", { name: "Close notification" });
    expect(close.className).toContain("text-[var(--ui-capture-muted)]");
  });

  test("pauses auto-dismiss on hover and restarts at 2.5 seconds", async () => {
    await renderOverlay();
    showToast({ type: "info", message: "Processing", duration: 1_000 });
    const toast = screen.getByRole("status");

    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText("Processing").isConnected).toBe(true);

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(2_499));
    expect(screen.getByText("Processing").isConnected).toBe(true);
    act(() => vi.advanceTimersByTime(1 + 120));
    expect(screen.queryByText("Processing")).toBeNull();
  });

  test("never starts a timer for persistent notifications", async () => {
    await renderOverlay();
    showToast({
      type: "update",
      message: "Restart to update",
      autoDismiss: false,
    });
    const toast = screen.getByRole("status");

    fireEvent.mouseEnter(toast);
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(30_000));

    expect(screen.getByText("Restart to update").isConnected).toBe(true);
  });
});
