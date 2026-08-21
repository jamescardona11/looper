import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cancelDownload, downloadModel } from "../../../data/transcription";
import { useModelDownloadEvents } from "../../../shared/hooks/useModelDownloadEvents";
import { modelKeys } from "./models-queries";
import type { DownloadEvent } from "../../../types/index";

export type ModelDownloadActivityStatus =
  "downloading" | "verifying" | "complete" | "cancelled" | "error";

export type ModelDownloadActivity = {
  model: string;
  label: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  file?: string;
  error?: string;
  status: ModelDownloadActivityStatus;
  ane: boolean;
  updatedAt: number;
};

export type StartModelDownload = {
  model: string;
  label: string;
  totalBytes: number;
  ane?: boolean;
};

export const activityToDownloadEvent = (
  activity: ModelDownloadActivity | undefined,
): DownloadEvent | undefined => {
  if (!activity) return undefined;
  switch (activity.status) {
    case "downloading":
    case "verifying":
      return {
        status: "downloading",
        percent: activity.percent,
        file: activity.file ?? "Preparing download",
        verifying: activity.status === "verifying",
      };
    case "complete":
      return { status: "complete", percent: 100 };
    case "cancelled":
      return { status: "cancelled", percent: activity.percent };
    case "error":
      return {
        status: "error",
        percent: activity.percent,
        message: activity.error ?? "Download failed",
      };
  }
};

type ModelDownloadActivityContextValue = {
  activities: Record<string, ModelDownloadActivity>;
  startDownload: (download: StartModelDownload) => Promise<void>;
  cancel: (model: string) => Promise<void>;
  retry: (model: string) => Promise<void>;
  dismiss: (model: string) => void;
};

const ModelDownloadActivityContext =
  createContext<ModelDownloadActivityContextValue | null>(null);

const KNOWN_MODEL_LABELS: Record<string, string> = {
  parakeet_tdt_int8: "Parakeet TDT V3",
  cohere_transcribe_int4: "Cohere Transcribe",
};

const fallbackModelLabel = (model: string) =>
  KNOWN_MODEL_LABELS[model] ??
  model
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

export function ModelDownloadActivityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [activities, setActivities] = useState<
    Record<string, ModelDownloadActivity>
  >({});

  const begin = useCallback((download: StartModelDownload) => {
    setActivities((current) => ({
      ...current,
      [download.model]: {
        model: download.model,
        label: download.label || fallbackModelLabel(download.model),
        downloadedBytes: 0,
        totalBytes: Math.max(0, download.totalBytes),
        percent: 0,
        status: "downloading",
        ane: download.ane ?? false,
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const markError = useCallback((model: string, error: string) => {
    setActivities((current) => {
      const previous = current[model];
      return {
        ...current,
        [model]: {
          model,
          label: previous?.label ?? fallbackModelLabel(model),
          downloadedBytes: previous?.downloadedBytes ?? 0,
          totalBytes: previous?.totalBytes ?? 0,
          percent: previous?.percent ?? 0,
          status: "error",
          error,
          ane: previous?.ane ?? false,
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const startDownload = useCallback(
    async (download: StartModelDownload) => {
      begin(download);
      try {
        await downloadModel(download.model, download.ane);
        await queryClient.invalidateQueries({
          queryKey: modelKeys.status(download.model),
        });
      } catch (error) {
        markError(
          download.model,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [begin, markError, queryClient],
  );

  const cancel = useCallback(
    async (model: string) => {
      try {
        await cancelDownload(model);
        await queryClient.invalidateQueries({
          queryKey: modelKeys.status(model),
        });
      } catch (error) {
        markError(
          model,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [markError, queryClient],
  );

  const retry = useCallback(
    async (model: string) => {
      const activity = activities[model];
      if (!activity) return;
      await startDownload({
        model,
        label: activity.label,
        totalBytes: activity.totalBytes,
        ane: activity.ane,
      });
    },
    [activities, startDownload],
  );

  const dismiss = useCallback((model: string) => {
    setActivities((current) => {
      if (!current[model]) return current;
      const next = { ...current };
      delete next[model];
      return next;
    });
  }, []);

  useModelDownloadEvents({
    onProgress: (payload) => {
      setActivities((current) => {
        const previous = current[payload.model];
        return {
          ...current,
          [payload.model]: {
            model: payload.model,
            label: previous?.label ?? fallbackModelLabel(payload.model),
            downloadedBytes: Math.max(
              previous?.downloadedBytes ?? 0,
              payload.downloaded,
            ),
            totalBytes: payload.total || previous?.totalBytes || 0,
            percent: Math.max(
              previous?.percent ?? 0,
              Math.min(100, Math.max(0, payload.percent)),
            ),
            file: payload.file,
            status: payload.verifying ? "verifying" : "downloading",
            ane: previous?.ane ?? false,
            updatedAt: Date.now(),
          },
        };
      });
    },
    onComplete: ({ model }) => {
      setActivities((current) => {
        const previous = current[model];
        const totalBytes = previous?.totalBytes ?? 0;
        return {
          ...current,
          [model]: {
            model,
            label: previous?.label ?? fallbackModelLabel(model),
            downloadedBytes: totalBytes,
            totalBytes,
            percent: 100,
            status: "complete",
            ane: previous?.ane ?? false,
            updatedAt: Date.now(),
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: modelKeys.status(model) });
    },
    onError: ({ model, error }) => markError(model, error),
    onCancelled: ({ model }) => {
      setActivities((current) => {
        const previous = current[model];
        return {
          ...current,
          [model]: {
            model,
            label: previous?.label ?? fallbackModelLabel(model),
            downloadedBytes: previous?.downloadedBytes ?? 0,
            totalBytes: previous?.totalBytes ?? 0,
            percent: previous?.percent ?? 0,
            status: "cancelled",
            ane: previous?.ane ?? false,
            updatedAt: Date.now(),
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: modelKeys.status(model) });
    },
  });

  const value = useMemo(
    () => ({ activities, startDownload, cancel, retry, dismiss }),
    [activities, cancel, dismiss, retry, startDownload],
  );

  return (
    <ModelDownloadActivityContext.Provider value={value}>
      {children}
    </ModelDownloadActivityContext.Provider>
  );
}

export function useModelDownloadActivity() {
  const context = useContext(ModelDownloadActivityContext);
  if (!context) {
    throw new Error(
      "useModelDownloadActivity must be used inside ModelDownloadActivityProvider",
    );
  }
  return context;
}
