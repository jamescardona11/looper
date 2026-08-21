import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AneCompileEvent,
  DownloadProgressPayload,
  PillTransformStreamPayload,
  TranscriptionRecord,
} from "../../contracts";

type DownloadEventHandlers = {
  onProgress?: (payload: DownloadProgressPayload) => void;
  onComplete?: (payload: { model: string }) => void;
  onError?: (payload: { model: string; error: string }) => void;
  onCancelled?: (payload: { model: string }) => void;
};

function subscribePayload<TPayload>(
  channel: string,
  handler: ((payload: TPayload) => void) | undefined,
): Array<Promise<UnlistenFn>> {
  if (!handler) return [];
  return [listen<TPayload>(channel, ({ payload }) => handler(payload))];
}

export function subscribeDownloadEvents(
  handlers: DownloadEventHandlers,
): Array<Promise<UnlistenFn>> {
  return [
    ...subscribePayload("download:progress", handlers.onProgress),
    ...subscribePayload("download:complete", handlers.onComplete),
    ...subscribePayload("download:error", handlers.onError),
    ...subscribePayload("download:cancelled", handlers.onCancelled),
  ];
}

type TranscriptionEventHandlers = {
  onComplete?: (payload: { record: TranscriptionRecord | null }) => void;
  onError?: () => void;
};

export function subscribeTranscriptionEvents(
  handlers: TranscriptionEventHandlers,
): Array<Promise<UnlistenFn>> {
  const subscriptions = subscribePayload(
    "transcription:complete",
    handlers.onComplete,
  );
  if (handlers.onError) {
    subscriptions.push(
      listen("transcription:error", () => handlers.onError?.()),
    );
  }
  return subscriptions;
}

export const subscribeTransformStream = (
  handler: (payload: PillTransformStreamPayload) => void,
): Promise<UnlistenFn> =>
  listen<PillTransformStreamPayload>("pill:transform-stream", ({ payload }) =>
    handler(payload),
  );

export const subscribeAneCompile = (
  handler: (payload: AneCompileEvent) => void,
): Promise<UnlistenFn> =>
  listen<AneCompileEvent>("ane:compile", ({ payload }) => handler(payload));
