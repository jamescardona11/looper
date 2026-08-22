// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../MeetingIntelligencePanel", () => ({
  default: ({ model }: { model: string }) => <div>Meeting {model}</div>,
}));
vi.mock("../SpeechModelPanel", () => ({
  default: ({ provider }: { provider: string }) => <div>Speech {provider}</div>,
}));
vi.mock("../LanguageModelPanel", () => ({
  default: ({ llmProvider }: { llmProvider: string }) => (
    <div>Writing {llmProvider}</div>
  ),
}));

import ProvidersTab from "../ProvidersTab";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });
const noop = vi.fn();

afterEach(cleanup);

describe("ProvidersTab", () => {
  test("routes grouped meeting, speech and writing settings", () => {
    render(
      <I18nProvider i18n={i18n}>
        <ProvidersTab
          variants={{ hidden: {}, visible: {}, exit: {} }}
          meeting={{
            provider: "local",
            setProvider: noop,
            model: "qwen-local",
            setModel: noop,
          }}
          speech={{
            enabled: true,
            setEnabled: noop,
            provider: "openai",
            setProvider: noop,
            endpoint: "https://api.openai.com/v1",
            setEndpoint: noop,
            apiKey: "",
            setApiKey: noop,
            model: "auto",
            setModel: noop,
            availableModels: [],
            fetchAvailableModels: noop,
          }}
          writing={{
            enabled: true,
            setEnabled: noop,
            provider: "anthropic",
            setProvider: noop,
            endpoint: "https://api.anthropic.com",
            setEndpoint: noop,
            apiKey: "",
            setApiKey: noop,
            model: "claude-haiku-4-5",
            setModel: noop,
            availableModels: [],
            fetchAvailableModels: noop,
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Meeting qwen-local")).toBeTruthy();
    expect(screen.getByText("Speech openai")).toBeTruthy();
    expect(screen.getByText("Writing anthropic")).toBeTruthy();
    expect(screen.getByText("Speech")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
  });
});
