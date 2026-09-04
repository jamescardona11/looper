// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadyStep } from "../ReadyStep";

type ShortcutOptions = {
  active: boolean;
  onCancel: () => void | Promise<void>;
  onPreviewChange: (preview: string) => void;
  onShortcutCaptured: (shortcut: string) => void;
};

const mocks = vi.hoisted(() => ({
  inserted: null as
    null | ((event: { payload: { chars: number; can_undo: boolean } }) => void),
  shortcutOptions: null as ShortcutOptions | null,
  disposeInsertionListener: vi.fn(),
  setShortcutCaptureActive: vi.fn((_active: boolean) => Promise.resolve()),
}));

vi.mock("../../../../data/capture/overlay", () => ({
  subscribePillInserted: vi.fn(
    (handler: (payload: { chars: number; can_undo: boolean }) => void) => {
      mocks.inserted = ({ payload }) => handler(payload);
      return Promise.resolve(mocks.disposeInsertionListener);
    },
  ),
}));

vi.mock("../../../../data/settings", () => ({
  setShortcutCaptureActive: (active: boolean) =>
    mocks.setShortcutCaptureActive(active),
}));
vi.mock("../../../../shared/hooks/useShortcutCapture", () => ({
  useShortcutCapture: vi.fn((options: ShortcutOptions) => {
    mocks.shortcutOptions = options;
  }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const readyProps = (): ComponentProps<typeof ReadyStep> => ({
  stepMotionProps: {
    custom: 1,
    variants: {},
    animate: "visible",
    exit: "exit",
    transition: { duration: 0, ease: "linear" },
  },
  smartShortcut: "Alt+Space",
  onSetShortcut: vi.fn(),
  modelLabel: "Parakeet",
  meetingIntelligenceLabel: "Local",
  autoLaunch: false,
  onSetAutoLaunch: vi.fn(),
  isCompleting: false,
  completionError: null,
  onComplete: vi.fn(),
});

function renderReady(
  overrides: Partial<ComponentProps<typeof ReadyStep>> = {},
) {
  const props = { ...readyProps(), ...overrides };
  const view = render(
    <I18nProvider i18n={i18n}>
      <ReadyStep {...props} />
    </I18nProvider>,
  );
  return { props, ...view };
}

async function emitInsertion(chars: number, canUndo: boolean) {
  await act(async () => {
    mocks.inserted?.({ payload: { chars, can_undo: canUndo } });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.inserted = null;
  mocks.shortcutOptions = null;
});

describe("ReadyStep", () => {
  it("keeps native insertion evidence optional and visible", async () => {
    renderReady();
    const complete = screen.getByRole("button", { name: "Start dictating" });
    expect((complete as HTMLButtonElement).disabled).toBe(false);

    await emitInsertion(12, false);
    expect((complete as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("First dictation test field"), {
      target: { value: "Hello world" },
    });
    await emitInsertion(11, false);
    expect((complete as HTMLButtonElement).disabled).toBe(false);
    await emitInsertion(11, true);

    await waitFor(() =>
      expect((complete as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.getByLabelText("Insertion verified")).toBeTruthy();
  });

  it("starts, previews, and cancels native shortcut capture", async () => {
    renderReady();
    fireEvent.click(screen.getByRole("button", { name: /Space/ }));

    expect(mocks.setShortcutCaptureActive).toHaveBeenCalledWith(true);
    expect(mocks.shortcutOptions?.active).toBe(true);
    act(() => mocks.shortcutOptions?.onPreviewChange("Command K"));
    expect(screen.getByText("Command K")).toBeTruthy();

    await act(async () => {
      await mocks.shortcutOptions?.onCancel();
    });
    expect(mocks.setShortcutCaptureActive).toHaveBeenCalledWith(false);
    expect(mocks.shortcutOptions?.active).toBe(false);
  });

  it("forwards captured shortcuts and recap actions", () => {
    const { props } = renderReady();
    act(() => mocks.shortcutOptions?.onShortcutCaptured("Meta+K"));
    expect(props.onSetShortcut).toHaveBeenCalledWith("Meta+K");

    fireEvent.click(screen.getByRole("switch", { name: /Open at login/ }));
    expect(props.onSetAutoLaunch).toHaveBeenCalledWith(true);
    expect(screen.getByText("Everything is available")).toBeTruthy();
  });

  it("lets people finish setup before verification", async () => {
    const onComplete = vi.fn();
    renderReady({ onComplete, completionError: "Try again" });
    expect(screen.getByText("Try again")).toBeTruthy();
    const complete = screen.getByRole("button", { name: "Start dictating" });
    fireEvent.click(complete);
    expect(onComplete).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("First dictation test field"), {
      target: { value: "Inserted" },
    });
    await emitInsertion(8, true);
    await waitFor(() =>
      expect((complete as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(complete);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("disposes the native insertion listener when unmounted", async () => {
    const { unmount } = renderReady();
    await waitFor(() => expect(mocks.inserted).not.toBeNull());
    unmount();
    await waitFor(() =>
      expect(mocks.disposeInsertionListener).toHaveBeenCalled(),
    );
  });
});
