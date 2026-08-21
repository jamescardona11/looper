import type * as LibraryTypes from "../../../types";

type FollowTimestampContract = Record<"followTimestamps", boolean> & {
  onFollowTimestampsChange: (
    next: boolean | ((current: boolean) => boolean),
  ) => void;
};

type DetailMutationContract = {
  onUpdate: (
    changes: LibraryTypes.LibraryItemPatch,
  ) => Promise<LibraryTypes.LibraryItem>;
  onExport: (
    kind: LibraryTypes.ExportFormat,
    destination: string,
  ) => Promise<void>;
};

export type LibraryDetailProps = Record<"item", LibraryTypes.LibraryItem> &
  Record<"models", LibraryTypes.SpeechModel[]> &
  Record<"shiftHeld", boolean> &
  Record<"availableTags", string[]> &
  Record<
    "onClose" | "onDelete" | "onCancel" | "onContinueRecording",
    () => void
  > &
  Record<"onRetry", () => Promise<void>> &
  FollowTimestampContract &
  DetailMutationContract;
