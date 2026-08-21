import { describe, expect, test } from "vitest";

import type { LibraryItem, SpeechModel } from "../../../../types";
import {
  confirmedRetranscriptionOptions,
  initialRetranscriptionState,
  retranscriptionCapabilities,
} from "../library-retranscribe-model";

const model = (overrides: Partial<SpeechModel>): SpeechModel =>
  ({
    id: "local",
    key: "local",
    label: "Local",
    description: "Local model",
    size_mb: 1,
    engine_id: "test",
    variant: "default",
    tags: [],
    capabilities: [],
    supported_languages: [],
    remote: false,
    installed: true,
    ...overrides,
  }) as SpeechModel;

const item = (overrides: Partial<LibraryItem>): LibraryItem =>
  ({
    id: "item",
    speech_model: "missing",
    show_timestamps: true,
    detect_speakers: true,
    ...overrides,
  }) as LibraryItem;

describe("retranscription model policy", () => {
  test("selects the first fallback without restoring stale capabilities", () => {
    const fallback = model({
      id: "fallback",
      capabilities: ["timestamps", "diarization"],
    });

    expect(initialRetranscriptionState(item({}), [fallback])).toEqual({
      modelKey: "fallback",
      showTimestamps: false,
      detectSpeakers: false,
    });
  });

  test("treats remote timestamps separately from local diarization", () => {
    const remote = model({ id: "remote", remote: true });

    expect(retranscriptionCapabilities([remote], "remote")).toEqual({
      timestamps: true,
      diarization: false,
    });
    expect(
      confirmedRetranscriptionOptions("remote", true, true, {
        timestamps: true,
        diarization: false,
      }),
    ).toEqual({
      model_key: "remote",
      show_timestamps: true,
      detect_speakers: false,
    });
  });
});
