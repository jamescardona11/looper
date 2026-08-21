import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { GeneralInputProps } from "./GeneralTab.types";
import { isGeneralSectionVisible } from "./general-settings-model";
import { LanguageInput } from "./general-language-input";
import { MicrophoneInput } from "./general-microphone-input";
import {
  getSelectedMicrophoneName,
  useMicrophoneTest,
} from "./GeneralMicrophoneTest";

function isTesting(status: ReturnType<typeof useMicrophoneTest>["status"]) {
  return status === "starting" || status === "listening";
}

export function GeneralInputSection(props: GeneralInputProps) {
  const { t } = useLingui();
  const [microphoneMenuOpen, setMicrophoneMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const microphoneTest = useMicrophoneTest(
    props.inputDevices,
    props.microphoneDevice,
  );
  const testing = isTesting(microphoneTest.status);
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
      return;
    }
    void microphoneTest.start();
  };
  const menuRaised = microphoneMenuOpen || languageMenuOpen;
  const sectionLayout = isGeneralSectionVisible(
    props.activeSection,
    "microphone",
  )
    ? "grid grid-cols-2 gap-3"
    : "hidden";

  return (
    <section
      data-settings-section="microphone"
      className={`${sectionLayout}${menuRaised ? " relative z-dropdown-open" : ""}`}
    >
      <MicrophoneInput
        activeLabel={activeMicrophone}
        controller={microphoneTest}
        onMenuChange={setMicrophoneMenuOpen}
        onToggleTest={toggleMicrophoneTest}
        settings={props}
        systemDefault={systemDefault}
        testing={testing}
      />
      <LanguageInput settings={props} onMenuChange={setLanguageMenuOpen} />
    </section>
  );
}
