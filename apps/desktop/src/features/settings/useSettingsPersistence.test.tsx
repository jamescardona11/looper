// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { StoredSettings } from "../../types";
import { useSettingsPersistence } from "./useSettingsPersistence";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

vi.mock("../../data/settings", () => ({
  updateSettings: mocks.updateSettings,
}));

const settings = { local_model: "initial" } as StoredSettings;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.updateSettings.mockReset();
  mocks.updateSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSettingsPersistence", () => {
  test("hydrates first and only autosaves a later draft change", async () => {
    const onHydrate = vi.fn();
    const onSettingsError = vi.fn();
    const onSaved = vi.fn();
    const onSaveFailed = vi.fn();
    const { rerender } = renderHook(
      ({ localModel }) =>
        useSettingsPersistence({
          enabled: true,
          loading: false,
          canAutosave: true,
          settings,
          settingsError: null,
          buildArgs: () => ({ localModel }),
          onHydrate,
          onSettingsError,
          onSaved,
          onSaveFailed,
        }),
      { initialProps: { localModel: "initial" } },
    );

    expect(onHydrate).toHaveBeenCalledWith(settings);
    expect(mocks.updateSettings).not.toHaveBeenCalled();

    rerender({ localModel: "changed" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      localModel: "changed",
    });
    expect(onSaved).toHaveBeenCalled();
  });

  test("serializes immediate saves", async () => {
    let resolveFirst: (() => void) | undefined;
    mocks.updateSettings
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useSettingsPersistence({
        enabled: false,
        loading: false,
        canAutosave: false,
        settings: undefined,
        settingsError: null,
        buildArgs: (overrides) => ({
          localModel: overrides?.localModel ?? "initial",
        }),
        onHydrate: vi.fn(),
        onSettingsError: vi.fn(),
        onSaved: vi.fn(),
        onSaveFailed: vi.fn(),
      }),
    );

    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    act(() => {
      firstSave = result.current.saveNow({ localModel: "first" });
      secondSave = result.current.saveNow({ localModel: "second" });
    });
    await act(() => Promise.resolve());
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.();
      await firstSave;
      await secondSave;
    });

    expect(mocks.updateSettings.mock.calls).toEqual([
      [{ localModel: "first" }],
      [{ localModel: "second" }],
    ]);
  });
});
