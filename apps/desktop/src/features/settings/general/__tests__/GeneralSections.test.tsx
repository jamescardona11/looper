// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GeneralFeatureSection } from "../GeneralFeatureSection";
import { GeneralProcessingSection } from "../GeneralProcessingSection";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("general settings sections", () => {
  test("switches processing mode and connects the missing-model action", () => {
    const setMode = vi.fn();
    const openModels = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <GeneralProcessingSection
          transcriptionMode="local"
          onTranscriptionModeChange={setMode}
          modelStatus={{
            parakeet: {
              key: "parakeet",
              installed: false,
              ane_installed: false,
              bytes_on_disk: 0,
              missing_files: ["model.bin"],
              directory: "/models/parakeet",
            },
          }}
          localModel="parakeet"
          remoteSpeechEnabled={false}
          remoteSpeechProvider="openai"
          remoteSpeechEndpoint="https://api.openai.com/v1"
          remoteSpeechModel="gpt-4o-transcribe"
          onOpenModelsTab={openModels}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Cloud processing" }));
    const download = screen.getByRole("button", { name: "Download one" });
    fireEvent.click(download);

    expect(setMode).toHaveBeenCalledWith("cloud");
    expect(openModels).toHaveBeenCalledOnce();
    expect(download.parentElement?.textContent).toContain(
      "No model installed.",
    );
  });

  test("routes Edit Mode prerequisites and keeps feature toggles connected", () => {
    const openAccount = vi.fn();
    const setPreview = vi.fn();
    const setSelectionPreview = vi.fn();
    const setScreenContext = vi.fn();
    const setDictionary = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <GeneralFeatureSection
          editModeEnabled={false}
          setEditModeEnabled={vi.fn()}
          previewBeforeInsertEnabled={false}
          setPreviewBeforeInsertEnabled={setPreview}
          previewBeforeInsertSelectionEnabled
          setPreviewBeforeInsertSelectionEnabled={setSelectionPreview}
          useScreenContext={false}
          setUseScreenContext={setScreenContext}
          autoDictionaryEnabled={false}
          autoDictionarySupported
          setAutoDictionaryEnabled={setDictionary}
          aiFeaturesReady={false}
          licenseGateActive={false}
          onOpenProvidersTab={vi.fn()}
          onOpenAccountTab={openAccount}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Auto Dictionary" }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Toggle Preview Before Inserting",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Toggle Preview Before Applying Transforms",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Use Screen Context" }),
    );

    expect(openAccount).toHaveBeenCalledOnce();
    expect(setDictionary).toHaveBeenCalledWith(true);
    expect(setPreview).toHaveBeenCalledWith(true);
    expect(setSelectionPreview).toHaveBeenCalledWith(false);
    expect(setScreenContext).toHaveBeenCalledWith(true);
  });
});
