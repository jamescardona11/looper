import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LocalLlmDownloadProgress,
  LocalLlmModelInfo,
  LocalLlmModelStatus,
  MeetingAiStatus,
} from "../../contracts/index";

export const LOCAL_LLM_MODEL_ID = "qwen3.5:4b-q3_k_m";

export const listLocalLlmModels = () =>
  invoke<LocalLlmModelInfo[]>("list_local_llm_models");

export const getLocalLlmModelStatus = (model: string) =>
  invoke<LocalLlmModelStatus>("get_local_llm_model_status", { model });

export const downloadLocalLlmModel = (model: string) =>
  invoke<void>("download_local_llm_model", { model });

export const cancelLocalLlmModelDownload = (model: string) =>
  invoke<boolean>("cancel_local_llm_model_download", { model });

export const deleteLocalLlmModel = (model: string) =>
  invoke<void>("delete_local_llm_model", { model });

export const getMeetingAiStatus = () =>
  invoke<MeetingAiStatus>("get_meeting_ai_status");

type LocalLlmDownloadListeners = {
  progress?: (payload: LocalLlmDownloadProgress) => void;
  complete?: (model: string) => void;
  error?: (model: string, error: string) => void;
  cancelled?: (model: string) => void;
};

export const listenLocalLlmDownloads = async (
  listeners: LocalLlmDownloadListeners,
): Promise<UnlistenFn> => {
  const unlisteners = await Promise.all([
    listen<LocalLlmDownloadProgress>(
      "local-llm:download-progress",
      ({ payload }) => listeners.progress?.(payload),
    ),
    listen<{ model: string }>("local-llm:download-complete", ({ payload }) =>
      listeners.complete?.(payload.model),
    ),
    listen<{ model: string; error: string }>(
      "local-llm:download-error",
      ({ payload }) => listeners.error?.(payload.model, payload.error),
    ),
    listen<{ model: string }>("local-llm:download-cancelled", ({ payload }) =>
      listeners.cancelled?.(payload.model),
    ),
  ]);
  return () => unlisteners.forEach((unlisten) => unlisten());
};
