import type { DownloadEvent, ModelInfo, ModelStatus } from "../../../contracts";

export type ModelCardProjection = {
  model: ModelInfo;
  status: ModelStatus;
  progress: DownloadEvent | undefined;
};

const idleDownload: DownloadEvent = { status: "idle", percent: 0 };

export function projectOnboardingModel(
  model: ModelInfo,
  knownStatus: ModelStatus | undefined,
  activity: DownloadEvent | undefined,
): ModelCardProjection {
  const displayState = activity ?? idleDownload;
  const installedFromActivity = displayState.status === "complete";
  const modelForDisplay =
    typeof model.ane_size_mb === "number"
      ? { ...model, size_mb: model.size_mb + model.ane_size_mb }
      : model;
  const progressStates = new Set<DownloadEvent["status"]>([
    "downloading",
    "cancelled",
    "error",
  ]);

  return {
    model: modelForDisplay,
    status: {
      key: model.key,
      installed: Boolean(knownStatus?.installed) || installedFromActivity,
      ane_installed: Boolean(knownStatus?.ane_installed),
      bytes_on_disk: knownStatus?.bytes_on_disk ?? 0,
      missing_files: knownStatus?.missing_files ?? [],
      directory: knownStatus?.directory ?? "",
    },
    progress: progressStates.has(displayState.status)
      ? displayState
      : undefined,
  };
}

export type ModelContinueIntent = "ignore" | "confirm" | "advance";

export const modelContinueIntent = (
  loading: boolean,
  selectedModelReady: boolean,
): ModelContinueIntent => {
  if (loading) return "ignore";
  return selectedModelReady ? "advance" : "confirm";
};

export const modelGridClassName = (modelCount: number) =>
  [
    "grid w-full justify-items-center gap-4",
    modelCount > 1 ? "grid-cols-2" : "grid-cols-1",
  ].join(" ");
