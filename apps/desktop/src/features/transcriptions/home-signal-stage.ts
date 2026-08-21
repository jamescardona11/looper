import type { PillInsertedPayload } from "../../data/capture/overlay";
import type { PillModePayload, PillStatePayload } from "../../contracts/pill";
import type { SignalStage } from "./components/CaptureStatusCard";

export const signalStageFromPillState = (
  status: PillStatePayload["status"],
): SignalStage => {
  if (status === "listening") return "listening";
  if (status === "processing") return "transcribing";
  if (status === "error") return "error";
  return "ready";
};

export const shouldShowWritingStage = (payload: PillModePayload): boolean =>
  payload.expanded && payload.tone === "cleanup";

export const shouldShowInsertedStage = (
  payload: PillInsertedPayload,
): boolean => payload.chars > 0 && payload.can_undo;
