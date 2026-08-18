import type { LibraryItem } from "../../../types";
import { clampProgress, shouldShowImportProgress } from "./library-utils";

type VoidCardAction =
  | "onOpen"
  | "onStartNameEdit"
  | "onCommitNameEdit"
  | "onCancelNameEdit"
  | "onStartTagEdit"
  | "onCancelTagEdit";
type AsyncCardAction = "onRetry" | "onCancel" | "onDelete";
type EditorIdentifier = "editingNameId" | "editingTagId";
type EditorDraft = "editingNameDraft" | "tagDraft";

export type LibraryCardProps = Record<VoidCardAction, () => void> &
  Record<AsyncCardAction, () => Promise<void>> &
  Record<EditorIdentifier, string | null> &
  Record<EditorDraft, string> & {
    item: LibraryItem;
    onRemoveTag: (tag: string) => Promise<void>;
    onClickTag?: (tag: string) => void;
    onChangeNameDraft: (value: string) => void;
    onChangeTagDraft: (value: string) => void;
    onCommitTagAdd: (value?: string) => void;
    shiftHeld: boolean;
    availableTags: string[];
  };

export type LibraryCardStatus = {
  progress: number;
  transcribing: boolean;
};

const cardCreatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function cardStatus(item: LibraryItem): LibraryCardStatus {
  const status = item.status;
  const converting =
    status.type === "importing" && shouldShowImportProgress(status.progress);
  const transcribing = status.type === "transcribing" || converting;
  const progress =
    status.type === "transcribing" || status.type === "importing"
      ? clampProgress(status.progress)
      : 0;
  return { progress, transcribing };
}

export function formatCardCreatedAt(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return cardCreatedAtFormatter.format(parsed);
}

export function libraryCardStatusText(
  type: LibraryItem["status"]["type"],
): string {
  const labels: Partial<Record<LibraryItem["status"]["type"], string>> = {
    complete: "Ready",
    error: "Couldn't transcribe",
    recording: "Recording",
    cancelled: "Cancelled",
  };
  return labels[type] ?? "Queued";
}

export function cardStatusClass(type: LibraryItem["status"]["type"]): string {
  if (type === "error") return "text-[var(--color-error)]";
  if (type === "recording") return "text-[var(--color-accent)]";
  return "text-content-muted";
}

export function cardActionKind(
  type: LibraryItem["status"]["type"],
): "none" | "cancel" | "retry" {
  if (type === "recording") return "none";
  if (["transcribing", "cancelling", "pending", "importing"].includes(type)) {
    return "cancel";
  }
  return "retry";
}
