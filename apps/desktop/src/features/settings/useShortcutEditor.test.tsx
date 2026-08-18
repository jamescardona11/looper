// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { StoredSettings } from "../../types";
import type { SettingsSaveOverrides } from "./settings-update-model";
import type { ShortcutPersistencePort } from "./useShortcutEditor";
import { useShortcutEditor } from "./useShortcutEditor";

const mocks = vi.hoisted(() => ({
  setCaptureActive: vi.fn(),
  resetCaptureState: vi.fn(),
  captureOptions: null as Record<string, unknown> | null,
}));

vi.mock("../../data/settings", () => ({
  setShortcutCaptureActive: mocks.setCaptureActive,
}));
vi.mock("../../shared/hooks/useShortcutCapture", () => ({
  useShortcutCapture: (options: Record<string, unknown>) => {
    mocks.captureOptions = options;
    return { resetCaptureState: mocks.resetCaptureState };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setCaptureActive.mockResolvedValue(undefined);
  mocks.captureOptions = null;
});

describe("useShortcutEditor", () => {
  test("hydrates legacy shortcuts into one editor snapshot", () => {
    const { result } = renderEditor();

    act(() =>
      result.current.hydrate({
        smart_shortcut: "Fn",
        smart_enabled: true,
        hold_shortcut: "Hold",
        hold_enabled: true,
        toggle_shortcut: "Toggle",
        toggle_enabled: false,
        shortcut_bindings: { smart: [], hold: [], toggle: [] },
        cleanup_enabled: false,
      } as unknown as StoredSettings),
    );

    expect(result.current.smartShortcut).toBe("Fn");
    expect(result.current.holdEnabled).toBe(true);
    expect(result.current.shortcutBindings.hold[0]?.shortcut).toBe("Hold");
  });

  test("updates a binding and persists all primary shortcuts", () => {
    const save = vi.fn<(overrides: SettingsSaveOverrides) => void>();
    const { result } = renderEditor({ save });

    act(() =>
      result.current.updateBinding("hold", 0, { shortcut: "Command+H" }),
    );

    expect(result.current.holdShortcut).toBe("Command+H");
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        holdShortcut: "Command+H",
        shortcutBindings: expect.objectContaining({
          hold: [expect.objectContaining({ shortcut: "Command+H" })],
        }),
      }),
    );
  });

  test("recovers a rejected shortcut before the next edit", () => {
    const { result } = renderEditor();

    act(() => {
      result.current.rejectDraft({ mode: "smart", index: 0 }, "Already used");
    });
    expect(result.current.invalidShortcutDrafts).toEqual({
      smart: { 0: "Already used" },
    });

    act(() =>
      result.current.updateBinding("smart", 0, { shortcut: "Command+Space" }),
    );
    expect(result.current.smartShortcut).toBe("Command+Space");
    expect(result.current.invalidShortcutDrafts).toEqual({});
  });

  test("adds an empty binding and immediately begins capture", () => {
    const { result } = renderEditor();

    act(() => result.current.addBinding("toggle"));

    expect(result.current.shortcutBindings.toggle).toHaveLength(2);
    expect(result.current.captureActive).toEqual({ mode: "toggle", index: 1 });
    expect(mocks.setCaptureActive).toHaveBeenCalledWith(true);
  });
});

function renderEditor(
  overrides: { save?: ShortcutPersistencePort["save"] } = {},
) {
  return renderHook(() =>
    useShortcutEditor({
      enabled: true,
      aiFeaturesReady: true,
      persistence: {
        save: overrides.save ?? vi.fn(),
        cancelScheduledSave: vi.fn(),
        flushScheduledSave: vi.fn(),
      },
      clearError: vi.fn(),
      showError: vi.fn(),
      onClose: vi.fn(),
    }),
  );
}
