import { invoke } from "@tauri-apps/api/core";
import type {
  RecordingPrunePolicy,
  TranscriptionRecord,
} from "../../contracts";

export async function getTranscriptions(): Promise<TranscriptionRecord[]> {
  const records = await invoke<TranscriptionRecord[] | null>(
    "get_transcriptions",
  );
  return records ?? [];
}

async function runRecordCommand(command: string, id: string): Promise<void> {
  await invoke(command, { id });
}

export const deleteTranscription = (id: string): Promise<void> =>
  runRecordCommand("delete_transcription", id);

export const retryTranscription = (id: string): Promise<void> =>
  runRecordCommand("retry_transcription", id);

export const cancelRetryTranscription = (id: string): Promise<void> =>
  runRecordCommand("cancel_retry_transcription", id);

export const retryLlmCleanup = (id: string): Promise<void> =>
  runRecordCommand("retry_llm_cleanup", id);

export const undoLlmCleanup = (id: string): Promise<void> =>
  runRecordCommand("undo_llm_cleanup", id);

export type RecordingPrunePreview = {
  candidate_count: number;
};

export type AudioStorageBudgetPreview = {
  current_bytes: number;
  budget_bytes: number;
  candidate_count: number;
  candidate_bytes: number;
};

export const previewRecordingPrune = (
  policy: RecordingPrunePolicy,
): Promise<RecordingPrunePreview> =>
  invoke("preview_recording_prune", { policy });

export const previewTranscriptionPrune = (
  policy: RecordingPrunePolicy,
): Promise<RecordingPrunePreview> =>
  invoke("preview_transcription_prune", { policy });

export const previewAudioStorageBudget = (
  budgetMb: number,
): Promise<AudioStorageBudgetPreview> =>
  invoke("preview_audio_storage_budget", { budgetMb });
