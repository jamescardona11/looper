// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { TEXT_SIZE_MODE_STORAGE_KEY } from "../../../../shared/lib/textSize";
import type { StoredSettings } from "../../../../contracts/index";
import { draftFromStoredSettings, useSettingsDraft } from "../useSettingsDraft";

const storedSettings = {
  transcription_mode: "local",
  local_model: "parakeet-v3",
  microphone_device: null,
  language: "es",
  auto_launch_enabled: false,
  start_in_background: true,
} as StoredSettings;

describe("settings draft", () => {
  test("hydrates optional values with product defaults", () => {
    const draft = draftFromStoredSettings(storedSettings, "large");

    expect(draft.remoteSpeechProvider).toBe("openai");
    expect(draft.remoteSpeechModel).toBe("auto");
    expect(draft.previewBeforeInsertSelectionEnabled).toBe(true);
    expect(draft.meetingSystemAudioEnabled).toBe(true);
    expect(draft.meetingLiveTranscriptEnabled).toBe(true);
    expect(draft.analyticsEnabled).toBe(true);
    expect(draft.textSizeMode).toBe("large");
  });

  test("does not keep background launch enabled without auto launch", () => {
    expect(
      draftFromStoredSettings(storedSettings, "default").startInBackground,
    ).toBe(false);
  });

  test("updates one field without replacing neighboring draft values", () => {
    const { result } = renderHook(() => useSettingsDraft("local"));

    act(() => {
      result.current.setters.localModel("first");
      result.current.setters.localModel((current) => `${current}-second`);
    });

    expect(result.current.draft.localModel).toBe("first-second");
    expect(result.current.draft.language).toBe("en");
  });

  test("hydrates the draft while preserving local text sizing", () => {
    localStorage.setItem(TEXT_SIZE_MODE_STORAGE_KEY, "large");
    const { result } = renderHook(() => useSettingsDraft("cloud"));

    act(() => result.current.hydrate(storedSettings));

    expect(result.current.draft.transcriptionMode).toBe("local");
    expect(result.current.draft.localModel).toBe("parakeet-v3");
    expect(result.current.draft.textSizeMode).toBe("large");
  });

  test("keeps the same draft reference when hydration is semantically equal", () => {
    const { result } = renderHook(() => useSettingsDraft("cloud"));

    act(() => result.current.hydrate(storedSettings));
    const hydrated = result.current.draft;
    act(() => result.current.hydrate({ ...storedSettings }));

    expect(result.current.draft).toBe(hydrated);
  });

  test("merges clean external fields without overwriting a local edit", () => {
    const { result } = renderHook(() => useSettingsDraft("cloud"));

    act(() => result.current.hydrate(storedSettings));
    act(() => result.current.setters.localModel("local-edit"));
    act(() =>
      result.current.hydrate(
        {
          ...storedSettings,
          local_model: "external-edit",
          language: "fr",
          microphone_meeting_awareness_enabled: false,
          meeting_system_audio_enabled: false,
          meeting_live_transcript_enabled: false,
        },
        storedSettings,
      ),
    );

    expect(result.current.draft.localModel).toBe("local-edit");
    expect(result.current.draft.language).toBe("fr");
    expect(result.current.draft.microphoneMeetingAwarenessEnabled).toBe(false);
    expect(result.current.draft.meetingSystemAudioEnabled).toBe(false);
    expect(result.current.draft.meetingLiveTranscriptEnabled).toBe(false);
  });
});
