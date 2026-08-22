import type { UnlistenFn } from "@tauri-apps/api/event";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { subscribeInputDevicesChanged } from "../../data/capture/audio";
import { subscribeSettingsChanged } from "../../data/settings";
import { subscribeTranscriptionEvents } from "../../data/transcription";
import {
  subscribeUpdateAvailable,
  subscribeUpdateCleared,
} from "../../data/system/updates";
import { modelKeys } from "../../features/settings/models/models-queries";
import { settingsKeys } from "../../features/settings/preferences/queries";
import { transcriptionKeys } from "../../features/transcriptions/queries";
import { updateKeys } from "../../features/updates/queries";
import type { TranscriptionRecord } from "../../contracts";

type AsyncSubscriptionScope = {
  track: (pending: Promise<UnlistenFn>) => void;
  guard: <TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
  ) => (...args: TArgs) => void;
  close: () => void;
};

export function QueryCacheBridge({
  client,
  windowLabel,
}: {
  client: QueryClient;
  windowLabel: string;
}) {
  useEffect(() => {
    const subscriptions = createAsyncSubscriptionScope();

    subscriptions.track(
      subscribeSettingsChanged(
        subscriptions.guard((settings) => {
          client.setQueryData(settingsKeys.detail(), settings);
          void client.invalidateQueries({ queryKey: modelKeys.speech() });
        }),
      ),
    );

    if (windowLabel === "settings") {
      connectSettingsWindowEvents(client, subscriptions);
    }
    return subscriptions.close;
  }, [client, windowLabel]);

  return null;
}

function connectSettingsWindowEvents(
  client: QueryClient,
  subscriptions: AsyncSubscriptionScope,
) {
  const refreshUpdates = () => {
    void client.invalidateQueries({ queryKey: updateKeys.status() });
  };
  subscriptions.track(
    subscribeUpdateAvailable(subscriptions.guard(refreshUpdates)),
  );
  subscriptions.track(
    subscribeUpdateCleared(subscriptions.guard(refreshUpdates)),
  );

  for (const pending of subscribeTranscriptionEvents({
    onComplete: subscriptions.guard(({ record }) =>
      publishCompletedTranscription(client, record),
    ),
    onError: subscriptions.guard(() => {
      void client.invalidateQueries({ queryKey: transcriptionKeys.all });
    }),
  })) {
    subscriptions.track(pending);
  }

  subscriptions.track(
    subscribeInputDevicesChanged(
      subscriptions.guard(() => {
        void client.invalidateQueries({ queryKey: settingsKeys.devices() });
      }),
    ),
  );
}

function publishCompletedTranscription(
  client: QueryClient,
  record: TranscriptionRecord | null | undefined,
) {
  const listKey = transcriptionKeys.list();
  const state = client.getQueryState(listKey);
  if (!record || !state?.data || state.fetchStatus === "fetching") {
    void client
      .cancelQueries({ queryKey: transcriptionKeys.all })
      .then(() =>
        client.invalidateQueries({ queryKey: transcriptionKeys.all }),
      );
    return;
  }
  client.setQueryData<TranscriptionRecord[]>(listKey, (current) =>
    current ? mergeTranscription(current, record) : current,
  );
}

export function mergeTranscription(
  current: TranscriptionRecord[],
  record: TranscriptionRecord,
) {
  const existing = current.findIndex(({ id }) => id === record.id);
  if (existing !== -1) {
    return current.map((item, index) => (index === existing ? record : item));
  }

  const timestamp = new Date(record.timestamp).getTime();
  const insertionPoint = current.findIndex(
    (item) => timestamp >= new Date(item.timestamp).getTime(),
  );
  const next = current.slice();
  next.splice(insertionPoint === -1 ? next.length : insertionPoint, 0, record);
  return next;
}

function createAsyncSubscriptionScope(): AsyncSubscriptionScope {
  let open = true;
  const unlisteners: UnlistenFn[] = [];

  return {
    track(pending) {
      void pending
        .then((unlisten) => (open ? unlisteners.push(unlisten) : unlisten()))
        .catch(() => undefined);
    },
    guard(handler) {
      return (...args) => {
        if (open) handler(...args);
      };
    },
    close() {
      open = false;
      while (unlisteners.length > 0) unlisteners.pop()?.();
    },
  };
}
