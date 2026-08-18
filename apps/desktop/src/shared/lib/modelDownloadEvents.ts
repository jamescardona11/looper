import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DownloadProgressPayload = {
  model: string;
  file: string;
  downloaded: number;
  total: number;
  percent: number;
  verifying: boolean;
};

export type ModelDownloadEventHandlers = {
  onProgress?: (payload: DownloadProgressPayload) => void;
  onComplete?: (payload: { model: string }) => void;
  onError?: (payload: { model: string; error: string }) => void;
  onCancelled?: (payload: { model: string }) => void;
};

export function subscribeModelDownloadEvents(
  handlers: ModelDownloadEventHandlers,
): Array<Promise<UnlistenFn>> {
  const subscriptions: Array<Promise<UnlistenFn>> = [];

  if (handlers.onProgress) {
    subscriptions.push(
      listen<DownloadProgressPayload>("download:progress", ({ payload }) =>
        handlers.onProgress?.(payload),
      ),
    );
  }
  if (handlers.onComplete) {
    subscriptions.push(
      listen<{ model: string }>("download:complete", ({ payload }) =>
        handlers.onComplete?.(payload),
      ),
    );
  }
  if (handlers.onError) {
    subscriptions.push(
      listen<{ model: string; error: string }>(
        "download:error",
        ({ payload }) => handlers.onError?.(payload),
      ),
    );
  }
  if (handlers.onCancelled) {
    subscriptions.push(
      listen<{ model: string }>("download:cancelled", ({ payload }) =>
        handlers.onCancelled?.(payload),
      ),
    );
  }
  return subscriptions;
}
