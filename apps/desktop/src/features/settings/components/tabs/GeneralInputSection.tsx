import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Check, Info, Microphone as Mic, Square } from "@phosphor-icons/react";
import { Dropdown } from "../../../../shared/ui/Dropdown";
import {
  getSelectedMicrophoneName,
  MicrophoneTestSlot,
  useMicrophoneTest,
} from "./GeneralMicrophoneTest";
import type { GeneralInputProps } from "./GeneralTab.types";
import { isGeneralSectionVisible } from "./general-settings-model";

export function GeneralInputSection(props: GeneralInputProps) {
  const { t } = useLingui();
  const [microphoneMenuOpen, setMicrophoneMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const microphoneTest = useMicrophoneTest(
    props.inputDevices,
    props.microphoneDevice,
  );
  const testing = ["starting", "listening"].includes(microphoneTest.status);
  const systemDefault = t({
    id: "settings.general.system_default",
    message: "System Default",
  });
  const activeMicrophone =
    microphoneTest.activeDeviceLabel ??
    getSelectedMicrophoneName(props.inputDevices, props.microphoneDevice) ??
    systemDefault;

  const toggleMicrophoneTest = () => {
    if (testing || microphoneTest.status === "error") {
      microphoneTest.reset();
    } else {
      void microphoneTest.start();
    }
  };

  return (
    <section
      data-settings-section="microphone"
      className={`${
        isGeneralSectionVisible(props.activeSection, "microphone")
          ? "grid grid-cols-2 gap-3"
          : "hidden"
      }${microphoneMenuOpen || languageMenuOpen ? " relative z-dropdown-open" : ""}`}
    >
      <div className="space-y-1.5">
        <div className="flex h-5 items-center justify-between gap-2">
          <span className="ui-text-label-strong ui-color-primary leading-none">
            {t({ id: "settings.general.microphone", message: "Microphone" })}
          </span>
          <button
            type="button"
            onClick={toggleMicrophoneTest}
            className={`flex h-5 items-center gap-1 rounded-md px-1.5 ui-text-meta transition-colors ${
              testing
                ? "ui-color-error hover:bg-error/10"
                : "ui-color-muted hover:bg-surface-elevated hover:text-content-primary"
            }`}
          >
            <MicrophoneTestAction
              testing={testing}
              hasError={microphoneTest.status === "error"}
            />
          </button>
        </div>
        <div className="h-[38px]">
          {["listening", "error"].includes(microphoneTest.status) ? (
            <MicrophoneTestSlot
              status={microphoneTest.status}
              levels={microphoneTest.levels}
              label={activeMicrophone}
              error={microphoneTest.error}
            />
          ) : (
            <Dropdown
              value={props.microphoneDevice ?? ""}
              onChange={(value) =>
                props.onMicrophoneDeviceChange(value === "" ? null : value)
              }
              onOpenChange={setMicrophoneMenuOpen}
              options={[
                { value: "", label: systemDefault },
                ...props.inputDevices.map((device) => ({
                  value: device.id,
                  label: device.name,
                })),
              ]}
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

      <div className="space-y-1.5">
        <div className="flex h-5 items-center">
          <div className="flex items-center gap-1">
            <span className="ui-text-label-strong ui-color-primary leading-none">
              {t({
                id: "settings.general.transcription_language",
                message: "Dictation Language",
              })}
            </span>
            <div className="group relative">
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center text-content-disabled transition-colors hover:text-content-muted"
                aria-label={t({
                  id: "settings.general.language_info_aria",
                  message:
                    "More information about transcription language support",
                })}
              >
                <Info size={10} aria-hidden="true" />
              </button>
              <div className="absolute right-0 bottom-full z-tooltip mb-1 hidden group-hover:block group-focus-within:block">
                <div className="w-56 px-2.5 py-1.5 ui-surface-menu ui-text-micro ui-color-secondary leading-tight">
                  {t({
                    id: "settings.general.language_info.active_model",
                    message:
                      "Unsupported languages aren't available on your active model. Switch to a supported model to use them.",
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Dropdown
          value={props.language}
          onChange={props.onLanguageChange}
          onOpenChange={setLanguageMenuOpen}
          options={props.languages.map((language) => ({
            value: language.code,
            label: language.name,
            locked: language.locked,
            isHeader: language.isHeader,
            prominentHeader: language.prominentHeader,
            description: language.description,
          }))}
          searchable
          searchPlaceholder={t({
            id: "settings.general.search_language",
            message: "Search language...",
          })}
          buttonClassName="min-h-[38px] px-3 py-2 ui-text-body-sm"
        />
        <p className="ui-text-micro ui-color-secondary leading-tight">
          {props.languageGuidance}
        </p>
      </div>
    </section>
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
