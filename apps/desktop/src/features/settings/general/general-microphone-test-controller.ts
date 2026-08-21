import { useLingui } from "@lingui/react/macro";
import { useMemo, useSyncExternalStore } from "react";
import type { DeviceInfo } from "../../../types/index";
import {
  createMicrophoneTestStore,
  type MicrophoneTestError,
} from "./microphone-test-store";

export function useMicrophoneTest(
  inputDevices: DeviceInfo[],
  microphoneDevice: string | null,
) {
  const { t } = useLingui();
  const store = useMemo(
    () => createMicrophoneTestStore(inputDevices, microphoneDevice),
    [inputDevices, microphoneDevice],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const translatedError = snapshot.error
    ? microphoneErrorMessage(snapshot.error, t)
    : null;
  return {
    activeDeviceLabel: snapshot.activeDeviceLabel,
    error: translatedError,
    levels: snapshot.levels,
    reset: store.reset,
    start: store.start,
    status: snapshot.status,
  };
}

function microphoneErrorMessage(
  error: MicrophoneTestError,
  t: ReturnType<typeof useLingui>["t"],
) {
  const messageByError = {
    unsupported: t({
      id: "settings.general.microphone_test.unsupported",
      message: "Microphone testing isn't available in this window.",
    }),
    "permission-denied": t({
      id: "settings.general.microphone_test.permission_error",
      message: "Microphone access was denied.",
    }),
    "not-found": t({
      id: "settings.general.microphone_test.not_found_error",
      message: "No microphone was found.",
    }),
    busy: t({
      id: "settings.general.microphone_test.busy_error",
      message: "That microphone is already in use.",
    }),
    "start-failed": t({
      id: "settings.general.microphone_test.start_error",
      message: "Couldn't start microphone test.",
    }),
  } satisfies Record<MicrophoneTestError, string>;
  return messageByError[error];
}
