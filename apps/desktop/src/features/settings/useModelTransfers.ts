import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import * as transcriptionData from "../../data/transcription";
import { useModelDownloadEvents } from "../../shared/hooks/useModelDownloadEvents";
import type { DownloadEvent, DownloadProgressPayload } from "../../types";
import { modelKeys } from "./models-queries";

type TransferState = Record<string, DownloadEvent>;

type TransferAction =
  | { type: "start"; model: string }
  | { type: "progress"; payload: DownloadProgressPayload }
  | { type: "complete"; model: string }
  | { type: "cancel"; model: string }
  | { type: "reset-cancelled"; model: string }
  | { type: "idle"; model: string }
  | { type: "error"; model: string; message: string };

type ModelTransferOptions = {
  enabled: boolean;
  onModelDeleted?: (model: string) => void | Promise<void>;
};

export function useModelTransfers({
  enabled,
  onModelDeleted,
}: ModelTransferOptions) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(modelTransferReducer, {});
  const resetTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const invalidateModel = useCallback(
    (model: string) => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.status(model) });
    },
    [queryClient],
  );

  useModelDownloadEvents({
    enabled,
    onProgress: (payload) => dispatch({ type: "progress", payload }),
    onComplete: ({ model }) => {
      dispatch({ type: "complete", model });
      invalidateModel(model);
    },
    onError: ({ model, error }) =>
      dispatch({ type: "error", model, message: error }),
    onCancelled: ({ model }) => {
      dispatch({ type: "cancel", model });
      invalidateModel(model);
    },
  });

  useEffect(
    () => () => {
      for (const timer of resetTimers.current.values()) clearTimeout(timer);
      resetTimers.current.clear();
    },
    [],
  );

  const download = useCallback(
    async (model: string, ane?: boolean) => {
      dispatch({ type: "start", model });
      try {
        const status = await transcriptionData.downloadModel(model, ane);
        queryClient.setQueryData(modelKeys.status(model), status);
        void queryClient.invalidateQueries({ queryKey: modelKeys.speech() });
      } catch (error) {
        console.error(error);
        dispatch({ type: "error", model, message: String(error) });
      }
    },
    [queryClient],
  );

  const remove = useCallback(
    async (model: string) => {
      try {
        const status = await transcriptionData.deleteModel(model);
        queryClient.setQueryData(modelKeys.status(model), status);
        dispatch({ type: "idle", model });
        await onModelDeleted?.(model);
        void queryClient.invalidateQueries({ queryKey: modelKeys.speech() });
      } catch (error) {
        console.error(error);
        dispatch({ type: "error", model, message: String(error) });
      }
    },
    [onModelDeleted, queryClient],
  );

  const cancel = useCallback(async (model: string) => {
    try {
      await transcriptionData.cancelDownload(model);
      dispatch({ type: "cancel", model });

      const previousTimer = resetTimers.current.get(model);
      if (previousTimer) clearTimeout(previousTimer);
      const timer = setTimeout(() => {
        resetTimers.current.delete(model);
        dispatch({ type: "reset-cancelled", model });
      }, 1_500);
      resetTimers.current.set(model, timer);
    } catch (error) {
      console.error("Failed to cancel download:", error);
    }
  }, []);

  return { downloadState: state, download, remove, cancel };
}

export function modelTransferReducer(
  state: TransferState,
  action: TransferAction,
): TransferState {
  const current =
    state[action.type === "progress" ? action.payload.model : action.model];
  const model =
    action.type === "progress" ? action.payload.model : action.model;
  let next: DownloadEvent;

  switch (action.type) {
    case "start":
      next = { status: "downloading", percent: 0, file: "starting" };
      break;
    case "progress":
      next = {
        status: "downloading",
        percent: Math.min(100, action.payload.percent),
        file: action.payload.file,
        verifying: action.payload.verifying,
      };
      break;
    case "complete":
      next = { status: "complete", percent: 100 };
      break;
    case "cancel":
      next = { status: "cancelled", percent: 0 };
      break;
    case "idle":
      next = { status: "idle", percent: 0 };
      break;
    case "error":
      next = {
        status: "error",
        message: action.message,
        percent: current?.percent ?? 0,
      };
      break;
    case "reset-cancelled":
      if (current?.status !== "cancelled") return state;
      next = { status: "idle", percent: 0 };
      break;
  }

  return { ...state, [model]: next };
}
