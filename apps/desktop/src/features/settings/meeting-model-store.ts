import type {
  LocalLlmDownloadProgress,
  LocalLlmModelInfo,
  LocalLlmModelStatus,
} from "../../types";
import {
  cancelLocalLlmModelDownload,
  deleteLocalLlmModel,
  downloadLocalLlmModel,
  getLocalLlmModelStatus,
  listLocalLlmModels,
  listenLocalLlmDownloads,
} from "../../data/local-llm";

export type MeetingModelSnapshot = {
  info: LocalLlmModelInfo | null;
  status: LocalLlmModelStatus | null;
  percent: number;
  error: string | null;
};

type DownloadListeners = {
  progress?: (payload: LocalLlmDownloadProgress) => void;
  complete?: (model: string) => void;
  error?: (model: string, error: string) => void;
  cancelled?: (model: string) => void;
};

type MeetingModelDependencies = {
  listModels: () => Promise<LocalLlmModelInfo[]>;
  getStatus: (model: string) => Promise<LocalLlmModelStatus>;
  listenDownloads: (listeners: DownloadListeners) => Promise<() => void>;
  download: (model: string) => Promise<void>;
  cancel: (model: string) => Promise<boolean>;
  remove: (model: string) => Promise<void>;
};

const defaultDependencies: MeetingModelDependencies = {
  listModels: listLocalLlmModels,
  getStatus: getLocalLlmModelStatus,
  listenDownloads: listenLocalLlmDownloads,
  download: downloadLocalLlmModel,
  cancel: cancelLocalLlmModelDownload,
  remove: deleteLocalLlmModel,
};

const initialSnapshot = (): MeetingModelSnapshot => ({
  info: null,
  status: null,
  percent: 0,
  error: null,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function createMeetingModelStore(
  model: string,
  dependencies: MeetingModelDependencies = defaultDependencies,
) {
  let snapshot = initialSnapshot();
  let activeVersion = 0;
  let stopDownloads: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const publish = (change: Partial<MeetingModelSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };

  const refresh = async (version = activeVersion) => {
    try {
      const [models, status] = await Promise.all([
        dependencies.listModels(),
        dependencies.getStatus(model),
      ]);
      if (version !== activeVersion) return;
      publish({
        info: models.find((candidate) => candidate.id === model) ?? null,
        status,
      });
    } catch (error) {
      if (version === activeVersion) publish({ error: errorMessage(error) });
    }
  };

  const start = () => {
    const version = ++activeVersion;
    void refresh(version);
    void dependencies
      .listenDownloads({
        progress: (payload) => {
          if (version !== activeVersion || payload.model !== model) return;
          publish({
            percent: payload.percent,
            status: snapshot.status
              ? {
                  ...snapshot.status,
                  state: payload.verifying ? "verifying" : "downloading",
                  bytesOnDisk: payload.downloaded,
                }
              : snapshot.status,
          });
        },
        complete: (downloadedModel) => {
          if (version === activeVersion && downloadedModel === model) {
            void refresh(version);
          }
        },
        error: (downloadedModel, message) => {
          if (version !== activeVersion || downloadedModel !== model) return;
          publish({ error: message });
          void refresh(version);
        },
        cancelled: (downloadedModel) => {
          if (version === activeVersion && downloadedModel === model) {
            void refresh(version);
          }
        },
      })
      .then((cleanup) => {
        if (version !== activeVersion) cleanup();
        else stopDownloads = cleanup;
      })
      .catch((error) => {
        if (version === activeVersion) publish({ error: errorMessage(error) });
      });
  };

  const stop = () => {
    activeVersion += 1;
    stopDownloads?.();
    stopDownloads = null;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe,
    download: async () => {
      publish({ error: null });
      try {
        await dependencies.download(model);
        await refresh();
      } catch (error) {
        publish({ error: errorMessage(error) });
      }
    },
    cancel: () => dependencies.cancel(model),
    remove: async () => {
      publish({ error: null });
      try {
        await dependencies.remove(model);
        await refresh();
      } catch (error) {
        publish({ error: errorMessage(error) });
      }
    },
  };
}
