// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import LanguageModelPanel from "./LanguageModelPanel";
import SpeechModelPanel from "./SpeechModelPanel";
import { uniqueModelNames } from "./ProviderConfigurationPanel";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const withI18n = (element: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{element}</I18nProvider>);

afterEach(cleanup);

describe("provider configuration panels", () => {
  test("normalizes discovered model names without reordering them", () => {
    expect(uniqueModelNames([" first ", "second", "first", " "])).toEqual([
      "first",
      "second",
    ]);
  });

  test("applies a writing provider preset and keeps model discovery", () => {
    const setEnabled = vi.fn();
    const setProvider = vi.fn();
    const setEndpoint = vi.fn();
    const setApiKey = vi.fn();
    const setModel = vi.fn();
    const fetchModels = vi.fn();
    withI18n(
      <LanguageModelPanel
        llmEnabled
        setLlmEnabled={setEnabled}
        llmProvider="openai"
        setLlmProvider={setProvider}
        llmEndpoint="https://api.openai.com/v1"
        setLlmEndpoint={setEndpoint}
        llmApiKey=""
        setLlmApiKey={setApiKey}
        llmModel="custom-model"
        setLlmModel={setModel}
        availableModels={[" model-a ", "model-a"]}
        fetchAvailableModels={fetchModels}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /AI writing/i }));
    expect(setEnabled).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    const providerMenu = screen.getAllByRole("listbox")[0]!;
    fireEvent.click(
      within(providerMenu).getByRole("option", { name: /Anthropic/ }),
    );
    expect(setProvider).toHaveBeenCalledWith("anthropic");
    expect(setEndpoint).toHaveBeenCalledWith("https://api.anthropic.com");
    expect(setModel).toHaveBeenCalledWith("claude-haiku-4-5");

    fireEvent.click(screen.getByRole("button", { name: "custom-model" }));
    expect(fetchModels).toHaveBeenCalledOnce();
    expect(screen.getByRole("option", { name: "model-a" })).toBeTruthy();
  });

  test("resets speech model selection when changing cloud provider", () => {
    const setProvider = vi.fn();
    const setEndpoint = vi.fn();
    const setModel = vi.fn();
    const fetchModels = vi.fn();
    withI18n(
      <SpeechModelPanel
        enabled
        setEnabled={vi.fn()}
        provider="openai"
        setProvider={setProvider}
        endpoint="https://api.openai.com/v1"
        setEndpoint={setEndpoint}
        apiKey=""
        setApiKey={vi.fn()}
        model=""
        setModel={setModel}
        availableModels={[]}
        fetchAvailableModels={fetchModels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    const providerMenu = screen.getAllByRole("listbox")[0]!;
    fireEvent.click(within(providerMenu).getByRole("option", { name: /Groq/ }));
    expect(setProvider).toHaveBeenCalledWith("groq");
    expect(setEndpoint).toHaveBeenCalledWith("https://api.groq.com/openai/v1");
    expect(setModel).toHaveBeenCalledWith("auto");

    fireEvent.click(screen.getByRole("button", { name: /Automatic/ }));
    expect(fetchModels).toHaveBeenCalledOnce();
  });
});
