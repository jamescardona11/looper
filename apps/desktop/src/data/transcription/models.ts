import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo, ModelStatus, SpeechModel } from "../../contracts";

export const listModels = (): Promise<ModelInfo[]> => invoke("list_models");

export const listSpeechModels = (): Promise<SpeechModel[]> =>
  invoke("list_speech_models");

export const checkModelStatus = (model: string): Promise<ModelStatus> =>
  invoke("check_model_status", { model });

export const downloadModel = (
  model: string,
  ane?: boolean,
): Promise<ModelStatus> => invoke("download_model", { model, ane });

export const deleteModel = (model: string): Promise<ModelStatus> =>
  invoke("delete_model", { model });

export async function cancelDownload(model: string): Promise<void> {
  await invoke("cancel_download", { model });
}

type RemoteCatalogCredentials = {
  endpoint: string;
  apiKey: string;
};

export const fetchLlmModels = (
  credentials: RemoteCatalogCredentials,
): Promise<string[]> => invoke("fetch_llm_models", credentials);

export const fetchRemoteSpeechModels = (
  credentials: RemoteCatalogCredentials,
): Promise<string[]> => invoke("fetch_remote_speech_models", credentials);
