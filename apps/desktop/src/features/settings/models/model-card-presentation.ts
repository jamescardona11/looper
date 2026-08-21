import {
  deriveModelStats,
  formatModelSize,
  formatQuantLabel,
} from "../../../shared/lib/modelStats";
import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
} from "../../../contracts/index";
import { WAVE_COLS, waveDots } from "./ModelCardShell";

export type ModelCardAction = "cancel" | "delete" | "download" | null;

export type ModelCardActivity =
  | { kind: "verifying" }
  | { kind: "downloading"; fileName: string | null; percent: number }
  | { kind: "idle"; facts: string[] };

export type ModelCardPresentation = {
  accent: string;
  glowStrong: string;
  glowSoft: string;
  dots: number[];
  animated: boolean;
  activity: ModelCardActivity;
  action: ModelCardAction;
};

const modelTheme = (model: ModelInfo) => {
  const nvidia = model.engine_id === "nvidia";
  return {
    accent: nvidia ? "var(--model-wave-nvidia)" : "var(--model-wave-whisper)",
    glowStrong: nvidia
      ? "var(--model-wave-glow-strong-nvidia)"
      : "var(--model-wave-glow-strong-whisper)",
    glowSoft: nvidia
      ? "var(--model-wave-glow-soft-nvidia)"
      : "var(--model-wave-glow-soft-whisper)",
  };
};

export function buildModelCardPresentation(
  model: ModelInfo,
  status: ModelStatus | undefined,
  progress: DownloadEvent | undefined,
  compact: boolean,
  showActions: boolean,
): ModelCardPresentation {
  const installed = status?.installed === true;
  const downloading = progress?.status === "downloading";
  const verifying = downloading && progress.verifying === true;
  const percent = downloading
    ? Math.min(100, Math.max(0, progress.percent))
    : 0;
  const visibleColumns = installed
    ? WAVE_COLS
    : downloading
      ? Math.round((percent / 100) * WAVE_COLS)
      : 0;
  const dots = waveDots(model.key).filter(
    (dot) => dot % WAVE_COLS < visibleColumns,
  );
  const stats = deriveModelStats(model);
  const facts = [stats.languagesLabel, formatModelSize(model.size_mb)];
  const quantization = formatQuantLabel(model.variant);
  if (quantization && !compact) facts.push(quantization);

  const activity: ModelCardActivity = verifying
    ? { kind: "verifying" }
    : downloading
      ? {
          kind: "downloading",
          fileName: progress.file.split("/").pop() || null,
          percent,
        }
      : { kind: "idle", facts };
  const action: ModelCardAction = !showActions
    ? null
    : downloading
      ? "cancel"
      : installed
        ? "delete"
        : model.downloadable
          ? "download"
          : null;

  return {
    ...modelTheme(model),
    dots,
    animated: downloading,
    activity,
    action,
  };
}
