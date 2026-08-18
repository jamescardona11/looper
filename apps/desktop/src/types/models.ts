type Fields<Names extends PropertyKey, Value> = {
  [Name in Names]: Value;
};

export type SupportedLanguage = Fields<"code" | "name", string>;

type ModelTextField = "key" | "label" | "description" | "engine_id" | "variant";
type ModelDescriptor = Fields<ModelTextField, string> &
  Fields<"tags" | "capabilities", string[]> & {
    size_mb: number;
    supported_languages: SupportedLanguage[];
  };

export type ModelInfo = ModelDescriptor &
  Fields<"family" | "category", string> & {
    downloadable: boolean;
    language_selection_mode: "auto_detect" | "user_select";
    ane_size_mb: number | null;
  };

export type SpeechModel = ModelDescriptor & {
  id: string;
  remote: boolean;
  installed: boolean;
};

export type ModelStatus = Fields<"installed" | "ane_installed", boolean> &
  Fields<"key" | "directory", string> & {
    bytes_on_disk: number;
    missing_files: string[];
  };

export type { DownloadProgressPayload } from "../shared/lib/modelDownloadEvents";

export type AneCompileEvent = Fields<"model" | "label", string> & {
  status: "start" | "done" | "error";
};

type DownloadDetails = {
  idle: { file?: string };
  downloading: { file: string; verifying?: boolean };
  complete: object;
  cancelled: object;
  error: { message: string };
};
type DownloadEventState = {
  [Status in keyof DownloadDetails]: {
    status: Status;
  } & DownloadDetails[Status];
}[keyof DownloadDetails];

export type DownloadEvent = DownloadEventState & { percent: number };

type CliStatusFlags =
  "installed" | "managedByApp" | "sourceAvailable" | "pathInShell";
export type CliInstallStatus = Fields<CliStatusFlags, boolean> &
  Fields<"installPath" | "sourcePath", string | null> & {
    command: string;
  };

export const LOCAL_LLM_MODEL_STATES = [
  "not_installed",
  "downloading",
  "verifying",
  "ready",
  "runtime_error",
  "license_required",
] as const;

export type LocalLlmModelState = (typeof LOCAL_LLM_MODEL_STATES)[number];

export type LocalLlmModelInfo = Fields<"id" | "label" | "fileName", string> &
  Fields<"sizeBytes" | "contextTokens", number> &
  Fields<"license" | "attributionUrl", string>;

export type LocalLlmModelStatus = Fields<"model" | "path", string> &
  Fields<"bytesOnDisk" | "totalBytes", number> & {
    state: LocalLlmModelState;
  };

export type MeetingAiStatus = {
  provider: "local" | "writing" | "none";
  model: string | null;
  state: LocalLlmModelState;
  actionableMessage: string | null;
};

export type LocalLlmDownloadProgress = Fields<"model", string> &
  Fields<"downloaded" | "total" | "percent", number> & {
    verifying: boolean;
  };
