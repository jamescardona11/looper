import { useLingui } from "@lingui/react/macro";
import { useMemo, useSyncExternalStore } from "react";
import type { DeviceInfo } from "../../../../types";
import {
  createMicrophoneTestStore,
  getSelectedMicrophoneName,
  type MicrophoneTestError,
  type MicrophoneTestLevels,
  type MicrophoneTestStatus,
} from "./microphone-test-store";

const METER_COLUMNS = 32;
const METER_DOT_SIZE = 2;
const METER_GAP = 2;
const METER_WIDTH =
  METER_COLUMNS * METER_DOT_SIZE + (METER_COLUMNS - 1) * METER_GAP;

export { getSelectedMicrophoneName };

export function MicrophoneTestSlot({
  status,
  levels,
  label,
  error,
}: {
  status: MicrophoneTestStatus;
  levels: MicrophoneTestLevels;
  label: string;
  error: string | null;
}) {
  const { t } = useLingui();

  if (status === "error") {
    return (
      <div className="flex h-[38px] items-center rounded-lg border border-error/30 bg-error/5 px-3">
        <p className="truncate ui-text-meta ui-color-error">
          {error ??
            t({
              id: "settings.general.microphone_test.generic_error",
              message: "Couldn't start microphone test.",
            })}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-[38px] items-center gap-2 rounded-lg border border-border-primary bg-surface-surface px-3"
      aria-live="polite"
    >
      <span
        className="min-w-0 flex-1 truncate ui-text-meta ui-color-muted"
        title={label}
      >
        {label}
      </span>
      <MicrophoneLevelMeter levels={levels} />
    </div>
  );
}

function MicrophoneLevelMeter({ levels }: { levels: MicrophoneTestLevels }) {
  return (
    <div
      className="ml-auto grid shrink-0 place-items-center overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${METER_COLUMNS}, ${METER_DOT_SIZE}px)`,
        gap: METER_GAP,
        width: METER_WIDTH,
      }}
    >
      {[levels.left, levels.right].flatMap((level, row) =>
        Array.from({ length: METER_COLUMNS }, (_, column) => {
          const active = column < Math.round(level * METER_COLUMNS);
          return (
            <span
              key={`${row}-${column}`}
              className="block"
              style={{
                width: METER_DOT_SIZE,
                height: METER_DOT_SIZE,
                backgroundColor: meterColor(column),
                opacity: active ? 0.95 : 0.16,
                borderRadius: active ? 0.5 : "50%",
                transition:
                  "border-radius 0.18s ease-out, opacity 0.18s ease-out",
              }}
            />
          );
        }),
      )}
    </div>
  );
}

function meterColor(column: number) {
  if (column < 5) return "var(--color-warning)";
  if (column >= METER_COLUMNS - 4) return "var(--color-error)";
  return "var(--color-success)";
}

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

  return {
    ...snapshot,
    error: snapshot.error ? microphoneErrorMessage(snapshot.error, t) : null,
    reset: store.reset,
    start: store.start,
  };
}

function microphoneErrorMessage(
  error: MicrophoneTestError,
  t: ReturnType<typeof useLingui>["t"],
) {
  switch (error) {
    case "unsupported":
      return t({
        id: "settings.general.microphone_test.unsupported",
        message: "Microphone testing isn't available in this window.",
      });
    case "permission-denied":
      return t({
        id: "settings.general.microphone_test.permission_error",
        message: "Microphone access was denied.",
      });
    case "not-found":
      return t({
        id: "settings.general.microphone_test.not_found_error",
        message: "No microphone was found.",
      });
    case "busy":
      return t({
        id: "settings.general.microphone_test.busy_error",
        message: "That microphone is already in use.",
      });
    case "start-failed":
      return t({
        id: "settings.general.microphone_test.start_error",
        message: "Couldn't start microphone test.",
      });
  }
}
