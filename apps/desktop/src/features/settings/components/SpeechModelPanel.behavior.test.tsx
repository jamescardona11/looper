// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import SpeechModelPanel, {
  type SpeechModelPanelProps,
} from "./SpeechModelPanel";

const english = setupI18n();
english.loadAndActivate({ locale: "en", messages: {} });

const createProps = (
  overrides: Partial<SpeechModelPanelProps> = {},
): SpeechModelPanelProps => ({
  enabled: true,
  setEnabled: vi.fn(),
  provider: "openai",
  setProvider: vi.fn(),
  endpoint: "https://api.openai.com/v1",
  setEndpoint: vi.fn(),
  apiKey: "not-a-real-secret",
  setApiKey: vi.fn(),
  model: "auto",
  setModel: vi.fn(),
  availableModels: [],
  fetchAvailableModels: vi.fn(),
  ...overrides,
});

function renderPanel(
  overrides: Partial<SpeechModelPanelProps> = {},
  i18n = english,
) {
  const props = createProps(overrides);
  render(
    <I18nProvider i18n={i18n}>
      <SpeechModelPanel {...props} />
    </I18nProvider>,
  );
  return props;
}

function ControlledSpeechModelPanel({
  onApiKeyChange,
}: {
  onApiKeyChange: (next: string) => void;
}) {
  const [provider, setProvider] =
    useState<SpeechModelPanelProps["provider"]>("openai");
  const [endpoint, setEndpoint] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("persisted-api-key");
  const [model, setModel] = useState("auto");

  return (
    <I18nProvider i18n={english}>
      <SpeechModelPanel
        enabled
        setEnabled={vi.fn()}
        provider={provider}
        setProvider={setProvider}
        endpoint={endpoint}
        setEndpoint={setEndpoint}
        apiKey={apiKey}
        setApiKey={(next) => {
          onApiKeyChange(next);
          setApiKey(next);
        }}
        model={model}
        setModel={setModel}
        availableModels={["whisper-1"]}
        fetchAvailableModels={vi.fn()}
      />
    </I18nProvider>
  );
}

afterEach(cleanup);

describe("SpeechModelPanel", () => {
  test("applies the selected preset in provider, endpoint, automatic-model order", () => {
    const calls: string[] = [];
    const props = renderPanel({
      provider: "custom",
      endpoint: "https://self-hosted.invalid/v1",
      model: "kept-until-selection",
      setProvider: (next) => calls.push(`provider:${next}`),
      setEndpoint: (next) => calls.push(`endpoint:${next}`),
      setModel: (next) => calls.push(`model:${next}`),
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle options" }));
    fireEvent.click(screen.getByRole("option", { name: /^OpenAI\b/ }));

    expect(calls).toEqual([
      "provider:openai",
      "endpoint:https://api.openai.com/v1",
      "model:auto",
    ]);
    expect(props.apiKey).toBe("not-a-real-secret");
  });

  test("preserves endpoint and model when selecting Custom", () => {
    const calls: string[] = [];
    renderPanel({
      provider: "openai",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-transcribe",
      setProvider: (next) => calls.push(`provider:${next}`),
      setEndpoint: (next) => calls.push(`endpoint:${next}`),
      setModel: (next) => calls.push(`model:${next}`),
    });

    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    fireEvent.click(screen.getByRole("option", { name: /^Custom/ }));

    expect(calls).toEqual(["provider:custom", "endpoint:", "model:auto"]);
  });

  test("keeps the selected missing model visible and normalizes discovered models", () => {
    renderPanel({
      model: "model-no-longer-discovered",
      availableModels: [
        " whisper-1 ",
        "whisper-1",
        " gpt-4o-transcribe ",
        "whisper-1",
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "model-no-longer-discovered" }),
    );

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      expect.stringMatching(/^Automatic \(/),
      "whisper-1",
      "gpt-4o-transcribe",
      "model-no-longer-discovered",
    ]);
  });

  test("represents an empty persisted model as the selected automatic option", () => {
    const setModel = vi.fn();
    renderPanel({ model: "", setModel });

    fireEvent.click(screen.getByRole("button", { name: /^Automatic \(/ }));

    const automaticOption = screen.getByRole("option", {
      name: /^Automatic \(/,
    });
    expect(automaticOption.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(automaticOption);
    expect(setModel).toHaveBeenCalledWith("auto");
  });

  test("preserves the API key while changing the provider and model", () => {
    const onApiKeyChange = vi.fn();
    render(<ControlledSpeechModelPanel onApiKeyChange={onApiKeyChange} />);

    const apiKeyInput = screen.getByLabelText(
      "Remote speech API key",
    ) as HTMLInputElement;
    expect(apiKeyInput.value).toBe("persisted-api-key");

    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    fireEvent.click(screen.getByRole("option", { name: /^Groq\b/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Automatic \(/ }));
    fireEvent.click(screen.getByRole("option", { name: "whisper-1" }));

    expect(onApiKeyChange).not.toHaveBeenCalled();
    expect(apiKeyInput.value).toBe("persisted-api-key");
  });

  test("discovers models only for providers with that capability", () => {
    const supported = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /^Automatic \(/ }));
    expect(supported.fetchAvailableModels).toHaveBeenCalledOnce();

    cleanup();
    const unsupported = renderPanel({ provider: "unsupported-provider" });

    fireEvent.click(screen.getByRole("button", { name: /^Automatic \(/ }));
    expect(unsupported.fetchAvailableModels).not.toHaveBeenCalled();
  });

  test("exposes localized accessible names for speech provider controls", () => {
    const spanish = setupI18n();
    spanish.loadAndActivate({
      locale: "es",
      messages: {
        "settings.speech_model.title": "Proveedor de voz remoto",
        "settings.speech_model.toggle": "Usar para voz a texto",
        "settings.speech_model.endpoint.aria": "URL del endpoint de voz",
        "settings.speech_model.api_key.aria": "Clave API de voz remota",
        "settings.speech_model.model.automatic": "Automático ({0})",
      },
    });
    renderPanel({ provider: "custom" }, spanish);

    expect(
      screen.getByRole("heading", { name: "Proveedor de voz remoto" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Usar para voz a texto" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Automático (auto)" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "URL del endpoint de voz" }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Clave API de voz remota").getAttribute("type"),
    ).toBe("password");
  });
});
