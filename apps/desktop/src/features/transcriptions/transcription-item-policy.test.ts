// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { SpeechModel, TranscriptionRecord } from "../../types";
import {
  describeTranscriptionItem,
  selectedTranscriptText,
  transcriptionItemActionPolicy,
} from "./transcription-item-policy";

const record = (overrides: Partial<TranscriptionRecord> = {}) =>
  ({
    id: "one",
    timestamp: "2026-08-16T12:30:00.000Z",
    text: "Clean transcript",
    raw_text: "Raw transcript",
    audio_path: "/tmp/one.wav",
    audio_available: true,
    status: "success",
    llm_cleaned: true,
    speech_model: "parakeet",
    word_count: 2,
    audio_duration_seconds: 1,
    synced: false,
    ...overrides,
  }) satisfies TranscriptionRecord;

describe("transcription item policy", () => {
  it("separates failure, metadata, and model presentation", () => {
    const models = [
      {
        key: "parakeet",
        id: "parakeet",
        label: "Parakeet Local",
      } as SpeechModel,
    ];
    const success = describeTranscriptionItem(record(), models, "Fallback");
    expect(success).toMatchObject({
      failed: false,
      text: "Clean transcript",
      speechModel: "Parakeet Local",
      cloudModel: false,
      audioRetryAvailable: true,
    });

    const failure = describeTranscriptionItem(
      record({ status: "error", error_message: "Decoder stopped" }),
      models,
      "Fallback",
    );
    expect(failure.failed).toBe(true);
    expect(failure.text).toBeNull();
    expect(failure.failure).toBe("Decoder stopped");
  });

  it("shows cleanup actions only for eligible local successes", () => {
    const eligible = transcriptionItemActionPolicy({
      failed: false,
      cloudModel: false,
      showLlmButtons: true,
      retryLlmAvailable: true,
      undoLlmAvailable: true,
      cleaned: true,
      rawTextAvailable: true,
      retryingCleanup: false,
      undoingCleanup: false,
      audioRetryAvailable: false,
    });
    expect(eligible).toEqual({
      contextMenuAllowed: true,
      audioRetryAvailable: false,
      cleanupVisible: true,
      restoreOriginalVisible: true,
      dividerVisible: true,
    });
    expect(
      transcriptionItemActionPolicy({
        ...{
          failed: false,
          cloudModel: true,
          showLlmButtons: true,
          retryLlmAvailable: true,
          undoLlmAvailable: true,
          cleaned: true,
          rawTextAvailable: true,
          retryingCleanup: true,
          undoingCleanup: false,
          audioRetryAvailable: false,
        },
      }),
    ).toEqual({
      contextMenuAllowed: false,
      audioRetryAvailable: false,
      cleanupVisible: false,
      restoreOriginalVisible: false,
      dividerVisible: false,
    });
  });

  it("accepts selected text only when an endpoint is inside the transcript", () => {
    const container = document.createElement("div");
    const child = document.createTextNode("chosen");
    container.append(child);
    expect(
      selectedTranscriptText(container, {
        toString: () => "chosen",
        anchorNode: child,
        focusNode: child,
      }),
    ).toBe("chosen");
    expect(
      selectedTranscriptText(container, {
        toString: () => "outside",
        anchorNode: document.body,
        focusNode: document.body,
      }),
    ).toBe("");
  });
});
