// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AneCompileDialog } from "../ane-compile-dialog";
import LanguageModelPanel from "../LanguageModelPanel";
import SpeechModelPanel from "../SpeechModelPanel";

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "contract",
  messages: {
    "ane_compile.title": "NEURAL-TITLE-UNIQUE",
    "settings.speech_model.title": "SPEECH-TITLE-UNIQUE",
    "settings.speech_model.toggle": "SPEECH-TOGGLE-UNIQUE",
    "settings.language_model.title": "WRITING-TITLE-UNIQUE",
    "settings.language_model.toggle": "WRITING-TOGGLE-UNIQUE",
  },
});

const renderTranslated = (element: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{element}</I18nProvider>);

afterEach(cleanup);

describe("settings model component contracts", () => {
  test("keeps the ANE modal semantics, presentation and model-specific body", () => {
    renderTranslated(<AneCompileDialog modelLabel="Parakeet TDT" />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("ane-compile-title");
    expect(dialog.className).toBe(
      "flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border-primary bg-surface-tertiary px-8 py-7 text-center ui-shadow-modal-deep",
    );
    expect(dialog.parentElement?.className).toBe(
      "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-6 backdrop-blur-xs",
    );
    expect(screen.getByText("NEURAL-TITLE-UNIQUE")).toBeTruthy();
    expect(screen.getByText(/Parakeet TDT/)).toBeTruthy();
  });

  test("keeps the speech and writing translation IDs wired to their panels", () => {
    renderTranslated(
      <>
        <SpeechModelPanel
          enabled
          setEnabled={vi.fn()}
          provider="openai"
          setProvider={vi.fn()}
          endpoint="https://api.openai.com/v1"
          setEndpoint={vi.fn()}
          apiKey=""
          setApiKey={vi.fn()}
          model="auto"
          setModel={vi.fn()}
          availableModels={[]}
          fetchAvailableModels={vi.fn()}
        />
        <LanguageModelPanel
          llmEnabled
          setLlmEnabled={vi.fn()}
          llmProvider="openai"
          setLlmProvider={vi.fn()}
          llmEndpoint="https://api.openai.com/v1"
          setLlmEndpoint={vi.fn()}
          llmApiKey=""
          setLlmApiKey={vi.fn()}
          llmModel="gpt-4.1-mini"
          setLlmModel={vi.fn()}
          availableModels={[]}
          fetchAvailableModels={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText("SPEECH-TITLE-UNIQUE")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "SPEECH-TOGGLE-UNIQUE" }),
    ).toBeTruthy();
    expect(screen.getByText("WRITING-TITLE-UNIQUE")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "WRITING-TOGGLE-UNIQUE" }),
    ).toBeTruthy();
  });
});
