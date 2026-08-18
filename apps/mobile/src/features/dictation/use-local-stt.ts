import * as Device from "expo-device";
import { useCallback, useEffect, useState } from "react";
import { getLocalSttMemoryTier } from "./local-stt-model";
import {
  deleteLocalSttModel,
  installLocalSttModel,
  isLocalSttModelInstalled,
  transcribeWithLocalStt,
} from "./local-stt-runtime";

export type LocalSttStatus =
  | "checking"
  | "not-installed"
  | "downloading"
  | "extracting"
  | "ready"
  | "error";

export function useLocalStt() {
  const [status, setStatus] = useState<LocalSttStatus>("checking");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const memoryTier = getLocalSttMemoryTier(Device.totalMemory);

  const refresh = useCallback(async () => {
    setError(null);
    setStatus("checking");
    try {
      setStatus((await isLocalSttModelInstalled()) ? "ready" : "not-installed");
    } catch (cause) {
      setError(messageFrom(cause));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback(async () => {
    if (memoryTier === "unsupported") return;
    setError(null);
    setProgress(0);
    setStatus("downloading");
    try {
      await installLocalSttModel((next) => {
        setStatus(next.phase);
        setProgress(next.percent);
      });
      setProgress(100);
      setStatus("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setStatus("error");
    }
  }, [memoryTier]);

  const remove = useCallback(async () => {
    setError(null);
    try {
      await deleteLocalSttModel();
      setProgress(0);
      setStatus("not-installed");
    } catch (cause) {
      setError(messageFrom(cause));
      setStatus("error");
    }
  }, []);

  return {
    status,
    progress,
    error,
    memoryTier,
    install,
    remove,
    refresh,
    transcribe: transcribeWithLocalStt,
  };
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Falló la transcripción local.";
}
