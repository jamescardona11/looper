import { useLingui } from "@lingui/react/macro";
import { Check, Microphone as Mic, Square } from "@phosphor-icons/react";
import { Dropdown } from "../../../../shared/ui/Dropdown";
import type { GeneralInputProps } from "./GeneralTab.types";
import { MicrophoneTestSlot } from "./GeneralMicrophoneTest";
import type { useMicrophoneTest } from "./general-microphone-test-controller";

type MicrophoneInputProps = {
  activeLabel: string;
  controller: ReturnType<typeof useMicrophoneTest>;
  onMenuChange: (open: boolean) => void;
  onToggleTest: () => void;
  settings: GeneralInputProps;
  systemDefault: string;
  testing: boolean;
};

export function MicrophoneInput({
  activeLabel,
  controller,
  onMenuChange,
  onToggleTest,
  settings,
  systemDefault,
  testing,
}: MicrophoneInputProps) {
  const { t } = useLingui();
  const showTest =
    controller.status === "listening" || controller.status === "error";
  const deviceOptions = [
    { value: "", label: systemDefault },
    ...settings.inputDevices.map((device) => ({
      value: device.id,
      label: device.name,
    })),
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex h-5 items-center justify-between gap-2">
        <span className="ui-text-label-strong ui-color-primary leading-none">
          {t({ id: "settings.general.microphone", message: "Microphone" })}
        </span>
        <button
          type="button"
          onClick={onToggleTest}
          className={`flex h-5 items-center gap-1 rounded-md px-1.5 ui-text-meta transition-colors ${
            testing
              ? "ui-color-error hover:bg-error/10"
              : "ui-color-muted hover:bg-surface-elevated hover:text-content-primary"
          }`}
        >
          <MicrophoneTestAction
            testing={testing}
            hasError={controller.status === "error"}
          />
        </button>
      </div>
      <div className="h-[38px]">
        {showTest ? (
          <MicrophoneTestSlot
            status={controller.status}
            levels={controller.levels}
            label={activeLabel}
            error={controller.error}
          />
        ) : (
          <Dropdown
            value={settings.microphoneDevice ?? ""}
            onChange={(value) =>
              settings.onMicrophoneDeviceChange(value === "" ? null : value)
            }
            onOpenChange={onMenuChange}
            options={deviceOptions}
            placeholder={t({
              id: "settings.general.select_microphone",
              message: "Select microphone...",
            })}
            className="h-[38px]"
            buttonClassName="h-[38px] px-3 py-2 ui-text-body-sm"
            menuClassName="top-[38px]"
          />
        )}
      </div>
    </div>
  );
}

function MicrophoneTestAction({
  testing,
  hasError,
}: {
  testing: boolean;
  hasError: boolean;
}) {
  const { t } = useLingui();
  if (testing) {
    return (
      <>
        <Square size={9} fill="currentColor" aria-hidden="true" />
        {t({ id: "settings.general.microphone_test.stop", message: "Stop" })}
      </>
    );
  }
  if (hasError) {
    return (
      <>
        <Check size={10} aria-hidden="true" />
        {t({ id: "settings.general.microphone_test.done", message: "Done" })}
      </>
    );
  }
  return (
    <>
      <Mic size={10} aria-hidden="true" />
      {t({ id: "settings.general.microphone_test.test", message: "Test" })}
    </>
  );
}
