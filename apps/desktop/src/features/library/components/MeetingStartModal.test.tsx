// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SpeechModel } from "../../../types";
import MeetingStartModal from "./MeetingStartModal";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const model: SpeechModel = {
  id: "parakeet_tdt_int8",
  key: "parakeet_tdt_int8",
  label: "Parakeet",
  description: "Local model",
  size_mb: 670,
  engine_id: "nvidia",
  variant: "int8",
  tags: [],
  capabilities: ["timestamps"],
  supported_languages: [{ code: "en", name: "English" }],
  remote: false,
  installed: true,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("MeetingStartModal", () => {
  test("keeps mobile sharing explicit and disables it with live transcript", () => {
    render(
      <I18nProvider i18n={i18n}>
        <MeetingStartModal
          models={[model]}
          liveModels={[model]}
          isStarting={false}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          onOpenMicrophoneSettings={vi.fn()}
          onOpenSystemAudioSettings={vi.fn()}
        />
      </I18nProvider>,
    );

    const mobile = screen.getByRole("switch", { name: "Mobile companion" });
    expect(mobile.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(mobile);
    expect(localStorage.getItem("looper.liveMeeting.shareTranscript")).toBe(
      "true",
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Live transcript" }),
    );
    expect(localStorage.getItem("looper.liveMeeting.shareTranscript")).toBe(
      "false",
    );
  });
});
