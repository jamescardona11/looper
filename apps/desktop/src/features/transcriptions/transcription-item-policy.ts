import type { SpeechModel, TranscriptionRecord } from "../../contracts";
import { formatTranscriptionLlmModel } from "../../shared/lib/llmProviders";
import { isRemoteTranscriptionSpeechModel } from "../../shared/lib/speechProviders";
import { resolveSpeechModelLabel } from "../settings/models/model-query-contracts";

export type TranscriptionItemPresentation = {
  date: string;
  time: string;
  failed: boolean;
  failure: string;
  text: string | null;
  speechModel: string | null;
  llmModel: string | null;
  mode: string | null;
  cloudModel: boolean;
  audioRetryAvailable: boolean;
};

export type TranscriptionItemActionPolicy = {
  contextMenuAllowed: boolean;
  audioRetryAvailable: boolean;
  cleanupVisible: boolean;
  restoreOriginalVisible: boolean;
  dividerVisible: boolean;
};

export function describeTranscriptionItem(
  record: TranscriptionRecord,
  speechModels: SpeechModel[] | undefined,
  defaultFailure: string,
): TranscriptionItemPresentation {
  const recordedAt = new Date(record.timestamp);
  const normalizedSpeechModel = (record.speech_model ?? "").trim();
  const remoteSpeech = isRemoteTranscriptionSpeechModel(normalizedSpeechModel);
  const failed = record.status === "error";
  return {
    date: recordedAt.toLocaleDateString([], { month: "short", day: "numeric" }),
    time: recordedAt.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
    failed,
    failure: record.error_message || defaultFailure,
    text: failed ? null : record.text,
    speechModel: resolveSpeechModelLabel(speechModels, normalizedSpeechModel),
    llmModel: record.llm_model
      ? formatTranscriptionLlmModel(record.llm_model)
      : null,
    mode: record.mode_name?.trim() || null,
    cloudModel: normalizedSpeechModel.startsWith("cloud-") || remoteSpeech,
    audioRetryAvailable: record.audio_available,
  };
}

export function transcriptionItemActionPolicy(input: {
  failed: boolean;
  cloudModel: boolean;
  showLlmButtons: boolean;
  retryLlmAvailable: boolean;
  undoLlmAvailable: boolean;
  cleaned: boolean;
  rawTextAvailable: boolean;
  retryingCleanup: boolean;
  undoingCleanup: boolean;
  audioRetryAvailable: boolean;
}): TranscriptionItemActionPolicy {
  const localSuccess = !input.failed && !input.cloudModel;
  const cleanupVisible =
    localSuccess && input.showLlmButtons && input.retryLlmAvailable;
  const restoreOriginalVisible =
    localSuccess &&
    input.showLlmButtons &&
    input.undoLlmAvailable &&
    input.cleaned &&
    input.rawTextAvailable;
  return {
    contextMenuAllowed: !input.retryingCleanup && !input.undoingCleanup,
    audioRetryAvailable: input.audioRetryAvailable,
    cleanupVisible,
    restoreOriginalVisible,
    dividerVisible:
      input.audioRetryAvailable || cleanupVisible || restoreOriginalVisible,
  };
}

export function selectedTranscriptText(
  container: HTMLElement | null,
  selection: Pick<Selection, "toString" | "anchorNode" | "focusNode"> | null,
): string {
  if (!container || !selection) return "";
  const text = selection.toString();
  if (!text.trim()) return "";
  const anchorInside =
    selection.anchorNode !== null && container.contains(selection.anchorNode);
  const focusInside =
    selection.focusNode !== null && container.contains(selection.focusNode);
  return anchorInside || focusInside ? text : "";
}
