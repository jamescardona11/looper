import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { MicrophoneLevelMeter } from "./general-microphone-meter";
import type {
  MicrophoneTestLevels,
  MicrophoneTestStatus,
} from "./microphone-test-store";

type MicrophoneTestSlotProps = {
  error: string | null;
  label: string;
  levels: MicrophoneTestLevels;
  status: MicrophoneTestStatus;
};

const slotClass = {
  error:
    "flex h-[38px] items-center rounded-lg border border-error/30 bg-error/5 px-3",
  errorCopy: "truncate ui-text-meta ui-color-error",
  label: "min-w-0 flex-1 truncate ui-text-meta ui-color-muted",
  signal:
    "flex h-[38px] items-center gap-2 rounded-lg border border-border-primary bg-surface-surface px-3",
} as const;

export function MicrophoneTestSlot({
  status,
  levels,
  label,
  error,
}: MicrophoneTestSlotProps) {
  const { t } = useLingui();
  if (status === "error") {
    const message =
      error ??
      t({
        id: "settings.general.microphone_test.generic_error",
        message: "Couldn't start microphone test.",
      });
    return (
      <MicrophoneTestError className={slotClass.error} message={message} />
    );
  }

  return (
    <MicrophoneTestSignal className={slotClass.signal} label={label}>
      <MicrophoneLevelMeter levels={levels} />
    </MicrophoneTestSignal>
  );
}

function MicrophoneTestError({
  className,
  message,
}: {
  className: string;
  message: string;
}) {
  return (
    <div className={className}>
      <p className={slotClass.errorCopy}>{message}</p>
    </div>
  );
}

function MicrophoneTestSignal({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className: string;
  label: string;
}) {
  return (
    <div className={className} aria-live="polite">
      <span className={slotClass.label} title={label}>
        {label}
      </span>
      {children}
    </div>
  );
}
