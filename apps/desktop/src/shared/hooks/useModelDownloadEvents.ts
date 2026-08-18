import { useRef } from "react";
import {
  subscribeModelDownloadEvents,
  type DownloadProgressPayload,
  type ModelDownloadEventHandlers,
} from "../../data/model-downloads";
import { safeUnlisten } from "../lib/safeUnlisten";
import { useMountEffect } from "./useMountEffect";

type UseModelDownloadEventsOptions = ModelDownloadEventHandlers & {
  enabled?: boolean;
};

export function useModelDownloadEvents(options: UseModelDownloadEventsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useMountEffect(() => {
    let mounted = true;
    const unlisteners: Array<() => void> = [];
    const current = () => optionsRef.current;
    const enabled = () => current().enabled !== false;

    const subscriptions = subscribeModelDownloadEvents({
      onProgress: (payload: DownloadProgressPayload) => {
        if (enabled()) current().onProgress?.(payload);
      },
      onComplete: (payload) => {
        if (enabled()) current().onComplete?.(payload);
      },
      onError: (payload) => {
        if (enabled()) current().onError?.(payload);
      },
      onCancelled: (payload) => {
        if (enabled()) current().onCancelled?.(payload);
      },
    });

    subscriptions.forEach((subscription) => {
      void subscription
        .then((unlisten) => {
          if (mounted) unlisteners.push(unlisten);
          else safeUnlisten(unlisten);
        })
        .catch((error: unknown) => {
          console.error("Failed to subscribe to download events", error);
        });
    });

    return () => {
      mounted = false;
      unlisteners.forEach(safeUnlisten);
    };
  });
}
