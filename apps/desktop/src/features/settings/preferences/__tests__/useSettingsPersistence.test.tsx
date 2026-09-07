// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { StoredSettings } from "../../../../contracts/index";
import { useSettingsPersistence } from "../useSettingsPersistence";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

vi.mock("../../../../data/settings", () => ({
  updateSettings: mocks.updateSettings,
}));

const settings = {
  local_model: "initial",
  microphone_meeting_awareness_enabled: true,
} as StoredSettings;

type HarnessDraft = {
  localModel: string;
  microphoneMeetingAwarenessEnabled: boolean;
};

function savedSettings(draft: HarnessDraft): StoredSettings {
  return {
    ...settings,
    local_model: draft.localModel,
    microphone_meeting_awareness_enabled:
      draft.microphoneMeetingAwarenessEnabled,
  };
}

const persistenceCallbacks = () => ({
  onHydrate: vi.fn(),
  onSettingsError: vi.fn(),
  onSaved: vi.fn(),
  onSaveFailed: vi.fn(),
});

function usePersistenceHarness(
  currentSettings: StoredSettings,
  callbacks: ReturnType<typeof persistenceCallbacks>,
) {
  const [draft, setDraft] = useState<HarnessDraft>({
    localModel: "before-hydration",
    microphoneMeetingAwarenessEnabled: true,
  });
  const onHydrate = useCallback(
    (incoming: StoredSettings, previous?: StoredSettings) => {
      callbacks.onHydrate(incoming, previous);
      const next = {
        localModel:
          !previous || draft.localModel === previous.local_model
            ? incoming.local_model
            : draft.localModel,
        microphoneMeetingAwarenessEnabled:
          !previous ||
          draft.microphoneMeetingAwarenessEnabled ===
            (previous.microphone_meeting_awareness_enabled ?? true)
            ? (incoming.microphone_meeting_awareness_enabled ?? true)
            : draft.microphoneMeetingAwarenessEnabled,
      };
      const changed =
        draft.localModel !== next.localModel ||
        draft.microphoneMeetingAwarenessEnabled !==
          next.microphoneMeetingAwarenessEnabled;
      if (changed) {
        setDraft(next);
      }
      return changed;
    },
    [callbacks, draft],
  );
  const buildArgs = useCallback(() => draft, [draft]);
  const persistence = useSettingsPersistence({
    enabled: true,
    loading: false,
    canAutosave: true,
    settings: currentSettings,
    settingsError: null,
    buildArgs,
    onHydrate,
    onSettingsError: callbacks.onSettingsError,
    onSaved: callbacks.onSaved,
    onSaveFailed: callbacks.onSaveFailed,
  });

  return { draft, setDraft, ...persistence };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.updateSettings.mockReset();
  mocks.updateSettings.mockImplementation(async (draft: HarnessDraft) =>
    savedSettings(draft),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSettingsPersistence", () => {
  test("does not autosave initial hydration and saves one later edit", async () => {
    const callbacks = persistenceCallbacks();
    const { result } = renderHook(() =>
      usePersistenceHarness(settings, callbacks),
    );

    expect(callbacks.onHydrate).toHaveBeenCalledWith(settings, undefined);
    expect(result.current.draft.localModel).toBe("initial");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();

    act(() =>
      result.current.setDraft((current) => ({
        ...current,
        localModel: "changed",
      })),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      localModel: "changed",
      microphoneMeetingAwarenessEnabled: true,
    });
    expect(callbacks.onSaved).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
  });

  test("merges an external event without autosaving and preserves it in a later edit", async () => {
    const callbacks = persistenceCallbacks();
    const { result, rerender } = renderHook(
      ({ currentSettings }) =>
        usePersistenceHarness(currentSettings, callbacks),
      { initialProps: { currentSettings: settings } },
    );

    const external = {
      ...settings,
      microphone_meeting_awareness_enabled: false,
    };
    rerender({ currentSettings: external });
    expect(result.current.draft).toEqual({
      localModel: "initial",
      microphoneMeetingAwarenessEnabled: false,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();

    act(() =>
      result.current.setDraft((current) => ({
        ...current,
        localModel: "after-external-event",
      })),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      localModel: "after-external-event",
      microphoneMeetingAwarenessEnabled: false,
    });
    expect(callbacks.onHydrate).toHaveBeenNthCalledWith(2, external, settings);
  });

  test("does not rehydrate or resave its own post-save echo", async () => {
    const callbacks = persistenceCallbacks();
    const { result, rerender } = renderHook(
      ({ currentSettings }) =>
        usePersistenceHarness(currentSettings, callbacks),
      { initialProps: { currentSettings: settings } },
    );

    act(() =>
      result.current.setDraft((current) => ({
        ...current,
        localModel: "saved-edit",
      })),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    rerender({
      currentSettings: savedSettings({
        localModel: "saved-edit",
        microphoneMeetingAwarenessEnabled: true,
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(callbacks.onHydrate).toHaveBeenCalledTimes(1);
    expect(callbacks.onHydrate).toHaveBeenCalledWith(settings, undefined);
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
  });

  test("an in-flight echo preserves a newer local edit and rebases the queued save", async () => {
    let resolveFirst: ((value: StoredSettings) => void) | undefined;
    mocks.updateSettings
      .mockImplementationOnce(
        () =>
          new Promise<StoredSettings>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async (draft: HarnessDraft) =>
        savedSettings(draft),
      );
    const callbacks = persistenceCallbacks();
    const { result, rerender } = renderHook(
      ({ currentSettings }) =>
        usePersistenceHarness(currentSettings, callbacks),
      { initialProps: { currentSettings: settings } },
    );

    act(() =>
      result.current.setDraft((current) => ({
        ...current,
        localModel: "first-edit",
      })),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      localModel: "first-edit",
      microphoneMeetingAwarenessEnabled: true,
    });

    const firstSaved = savedSettings({
      localModel: "first-edit",
      microphoneMeetingAwarenessEnabled: true,
    });
    rerender({
      currentSettings: firstSaved,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() =>
      result.current.setDraft((current) => ({
        ...current,
        localModel: "second-edit",
      })),
    );
    rerender({
      currentSettings: {
        ...firstSaved,
        microphone_meeting_awareness_enabled: false,
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    expect(result.current.draft).toEqual({
      localModel: "second-edit",
      microphoneMeetingAwarenessEnabled: false,
    });
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.(firstSaved);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.updateSettings.mock.calls).toEqual([
      [
        {
          localModel: "first-edit",
          microphoneMeetingAwarenessEnabled: true,
        },
      ],
      [
        {
          localModel: "second-edit",
          microphoneMeetingAwarenessEnabled: false,
        },
      ],
    ]);
  });

  test("serializes immediate saves", async () => {
    let resolveFirst: ((value: StoredSettings) => void) | undefined;
    mocks.updateSettings
      .mockImplementationOnce(
        () =>
          new Promise<StoredSettings>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(settings);

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
      resolveFirst?.(settings);
      await firstSave;
      await secondSave;
    });

    expect(mocks.updateSettings.mock.calls).toEqual([
      [{ localModel: "first" }],
      [{ localModel: "second" }],
    ]);
  });
});
