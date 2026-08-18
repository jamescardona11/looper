export type SupportedLanguage = {
  code: string;
  name: string;
};

type ModelDescriptor = {
  key: string;
  label: string;
  description: string;
  size_mb: number;
  engine_id: string;
  variant: string;
  tags: string[];
  capabilities: string[];
  supported_languages: SupportedLanguage[];
};

export type ModelInfo = ModelDescriptor & {
  family: string;
  category: string;
  downloadable: boolean;
  language_selection_mode: "auto_detect" | "user_select";
  ane_size_mb: number | null;
};

export type SpeechModel = ModelDescriptor & {
  id: string;
  remote: boolean;
  installed: boolean;
};

export type ModelStatus = {
  key: string;
  installed: boolean;
  ane_installed: boolean;
  bytes_on_disk: number;
  missing_files: string[];
  directory: string;
};

export type { DownloadProgressPayload } from "../shared/lib/modelDownloadEvents";

export type AneCompileEvent = {
  model: string;
  label: string;
  status: "start" | "done" | "error";
};

type DownloadEventState =
  | { status: "idle"; file?: string }
  | { status: "downloading"; file: string; verifying?: boolean }
  | { status: "complete" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export type DownloadEvent = DownloadEventState & { percent: number };

export type CliInstallStatus = {
  installed: boolean;
  managedByApp: boolean;
  sourceAvailable: boolean;
  installPath: string | null;
  sourcePath: string | null;
  command: string;
  pathInShell: boolean;
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

export type LocalLlmModelInfo = {
  id: string;
  label: string;
  fileName: string;
  sizeBytes: number;
  contextTokens: number;
  license: string;
  attributionUrl: string;
};

export type LocalLlmModelStatus = {
  model: string;
  state: LocalLlmModelState;
  bytesOnDisk: number;
  totalBytes: number;
  path: string;
};

export type MeetingAiStatus = {
  provider: "local" | "writing" | "none";
  model: string | null;
  state: LocalLlmModelState;
  actionableMessage: string | null;
};

export type LocalLlmDownloadProgress = {
  model: string;
  downloaded: number;
  total: number;
  percent: number;
  verifying: boolean;
};
