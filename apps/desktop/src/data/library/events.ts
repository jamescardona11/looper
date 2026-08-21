import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LibraryImportProgressPayload,
  LibraryProgressPayload,
  MeetingCaptureState,
  MeetingDetails,
  MeetingTranscriptUpdate,
} from "../../contracts";

export type LibraryEventHandlers = {
  transcriptionProgress: (payload: LibraryProgressPayload) => void;
  transcriptionComplete: (payload: { id?: string }) => void;
  transcriptionError: (payload: {
    id: string;
    message: string;
    cancelled: boolean;
  }) => void;
  importProgress: (payload: LibraryImportProgressPayload) => void;
  watchImported: () => void;
};

type DragPathsPayload = { paths?: string[] };

const subscribeDragPaths = (
  channel: string,
  handler: (paths: string[]) => void,
) =>
  listen<DragPathsPayload>(channel, ({ payload }) =>
    handler(payload?.paths ?? []),
  );

export const subscribeLibraryDragEnter = (handler: (paths: string[]) => void) =>
  subscribeDragPaths("tauri://drag-enter", handler);

export const subscribeLibraryDragOver = (handler: (paths: string[]) => void) =>
  subscribeDragPaths("tauri://drag-over", handler);

export const subscribeLibraryDragLeave = (handler: () => void) =>
  listen("tauri://drag-leave", handler);

export const subscribeLibraryDragDrop = (handler: (paths: string[]) => void) =>
  subscribeDragPaths("tauri://drag-drop", handler);

export const subscribeLibraryOpenImport = (
  handler: (paths: string[]) => void,
) => listen<string[]>("library:open_import", ({ payload }) => handler(payload));

export const notifyLibraryRendererReady = () => emit("library:renderer_ready");

async function combineSubscriptions(
  subscriptions: Array<Promise<UnlistenFn>>,
): Promise<UnlistenFn> {
  const unlisteners = await Promise.all(subscriptions);
  return () => unlisteners.forEach((unlisten) => unlisten());
}

export const subscribeLibraryEvents = (
  handlers: LibraryEventHandlers,
): Promise<UnlistenFn> =>
  combineSubscriptions([
    listen<LibraryProgressPayload>(
      "library:transcription_progress",
      ({ payload }) => handlers.transcriptionProgress(payload),
    ),
    listen<{ id?: string }>("library:transcription_complete", ({ payload }) =>
      handlers.transcriptionComplete(payload),
    ),
    listen<{ id: string; message: string; cancelled: boolean }>(
      "library:transcription_error",
      ({ payload }) => handlers.transcriptionError(payload),
    ),
    listen<LibraryImportProgressPayload>(
      "library:import_progress",
      ({ payload }) => handlers.importProgress(payload),
    ),
    listen("library:watch_imported", handlers.watchImported),
  ]);

export const subscribeMeetingCaptureState = (
  handler: (state: MeetingCaptureState) => void,
): Promise<UnlistenFn> =>
  listen<MeetingCaptureState>("meeting:capture_state", ({ payload }) =>
    handler(payload),
  );

export const subscribeMeetingDetails = (handlers: {
  detailsChanged: (details: MeetingDetails) => void;
  transcriptUpdate: (update: MeetingTranscriptUpdate) => void;
}): Promise<UnlistenFn> =>
  combineSubscriptions([
    listen<MeetingDetails>("meeting:details_changed", ({ payload }) =>
      handlers.detailsChanged(payload),
    ),
    listen<MeetingTranscriptUpdate>(
      "meeting:transcript_update",
      ({ payload }) => handlers.transcriptUpdate(payload),
    ),
  ]);
