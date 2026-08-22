import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer } from "react";
import {
  checkForUpdates,
  downloadAndInstallUpdate,
  getInstalledVersion,
  restartForUpdate,
  subscribeUpdateProgress,
  subscribeUpdaterCheck,
  type UnlistenFn,
  type UpdateDownloadProgress,
} from "../../../data/system/updates";
import { updateKeys, useUpdateStatus } from "../queries";

const PENDING_RESTART_KEY = "looper_update_pending_restart";

type LocalUpdateState = {
  checking: boolean;
  downloading: boolean;
  progress: number;
  checkError: string | null;
  downloadError: string | null;
  installed: boolean;
};

type LocalUpdateAction =
  | { type: "check-started" }
  | { type: "check-finished" }
  | { type: "check-failed"; message: string }
  | { type: "download-started" }
  | { type: "download-progressed"; progress: number }
  | { type: "download-finished" }
  | { type: "download-failed"; message: string }
  | { type: "restart-pending" };

const initialState: LocalUpdateState = {
  checking: false,
  downloading: false,
  progress: 0,
  checkError: null,
  downloadError: null,
  installed: false,
};

function updateState(
  state: LocalUpdateState,
  action: LocalUpdateAction,
): LocalUpdateState {
  switch (action.type) {
    case "check-started":
      return {
        ...state,
        checking: true,
        checkError: null,
        downloadError: null,
      };
    case "check-finished":
      return { ...state, checking: false };
    case "check-failed":
      return { ...state, checkError: action.message };
    case "download-started":
      return {
        ...state,
        downloading: true,
        progress: 0,
        checkError: null,
        downloadError: null,
      };
    case "download-progressed":
      return { ...state, progress: action.progress };
    case "download-finished":
      return { ...state, downloading: false, installed: true };
    case "download-failed":
      return { ...state, downloading: false, downloadError: action.message };
    case "restart-pending":
      return { ...state, installed: true };
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function boundedPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function progressPercent(payload: UpdateDownloadProgress) {
  if (typeof payload.progress === "number") {
    return boundedPercent(payload.progress);
  }
  if (typeof payload.total === "number" && payload.total > 0) {
    return boundedPercent((payload.downloaded / payload.total) * 100);
  }
  return null;
}

function releaseAsyncSubscription(
  subscription: Promise<UnlistenFn>,
): () => void {
  let released = false;
  let unlisten: UnlistenFn | undefined;

  void subscription.then((stop) => {
    if (released) stop();
    else unlisten = stop;
  });

  return () => {
    released = true;
    unlisten?.();
  };
}

export function useUpdateChecker(autoCheck: boolean) {
  const queryClient = useQueryClient();
  const { data: updateStatus } = useUpdateStatus();
  const [state, dispatch] = useReducer(updateState, initialState);
  const availableVersion =
    state.installed || !updateStatus?.available ? null : updateStatus.version;

  useEffect(() => {
    const pendingVersion = localStorage.getItem(PENDING_RESTART_KEY);
    if (!pendingVersion) return;

    void getInstalledVersion().then((currentVersion) => {
      if (pendingVersion === currentVersion) {
        localStorage.removeItem(PENDING_RESTART_KEY);
      } else {
        dispatch({ type: "restart-pending" });
      }
    });
  }, []);

  const runCheck = useCallback(async () => {
    dispatch({ type: "check-started" });
    try {
      await checkForUpdates();
      await queryClient.invalidateQueries({ queryKey: updateKeys.status() });
    } catch (reason) {
      console.error("Update check failed:", reason);
      dispatch({ type: "check-failed", message: errorMessage(reason) });
    } finally {
      dispatch({ type: "check-finished" });
    }
  }, [queryClient]);

  useEffect(() => {
    if (autoCheck && updateStatus?.configured) void runCheck();
    return releaseAsyncSubscription(
      subscribeUpdaterCheck(() => {
        if (updateStatus?.configured) void runCheck();
      }),
    );
  }, [autoCheck, runCheck, updateStatus?.configured]);

  useEffect(
    () =>
      releaseAsyncSubscription(
        subscribeUpdateProgress((payload) => {
          if (!payload) return;
          const progress = progressPercent(payload);
          if (progress !== null) {
            dispatch({ type: "download-progressed", progress });
          }
        }),
      ),
    [],
  );

  const install = async () => {
    dispatch({ type: "download-started" });
    try {
      const pendingVersion = availableVersion;
      await downloadAndInstallUpdate();
      dispatch({ type: "download-finished" });
      queryClient.setQueryData(updateKeys.status(), {
        configured: true,
        available: false,
        version: null,
      });
      if (pendingVersion) {
        localStorage.setItem(PENDING_RESTART_KEY, pendingVersion);
      }
    } catch (reason) {
      console.error("Update failed:", reason);
      dispatch({ type: "download-failed", message: errorMessage(reason) });
    }
  };

  const restart = async () => {
    localStorage.removeItem(PENDING_RESTART_KEY);
    await restartForUpdate();
  };

  return {
    configured: updateStatus?.configured,
    availableVersion,
    ...state,
    check: runCheck,
    install,
    restart,
  };
}

export type UpdateCheckerModel = ReturnType<typeof useUpdateChecker>;
