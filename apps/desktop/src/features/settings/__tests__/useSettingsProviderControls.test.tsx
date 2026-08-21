// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { StoredSettings } from "../../../types";
import { draftFromStoredSettings } from "../useSettingsDraft";
import { useSettingsProviderControls } from "../useSettingsProviderControls";

const mocks = vi.hoisted(() => ({
  fetchWriting: vi.fn(),
  fetchSpeech: vi.fn(),
}));

vi.mock("../models-queries", () => ({
  useFetchLlmModels: () => ({ mutateAsync: mocks.fetchWriting }),
  useFetchRemoteSpeechModels: () => ({ mutateAsync: mocks.fetchSpeech }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchWriting.mockResolvedValue(["writing-a", "writing-b"]);
  mocks.fetchSpeech.mockResolvedValue(["speech-a"]);
});

describe("useSettingsProviderControls", () => {
  test("resets discovered models without clearing the selected model on key edits", () => {
    const actions = createActions();
    const { result } = renderProviderControls(actions);

    act(() => result.current.setLlmApiKey("new-key"));

    expect(actions.setLlmApiKey).toHaveBeenCalledWith("new-key");
    expect(actions.setLlmModel).not.toHaveBeenCalled();

    act(() => result.current.setLlmProvider("anthropic"));
    expect(actions.setLlmModel).toHaveBeenCalledWith("");
    expect(actions.setLlmProvider).toHaveBeenCalledWith("anthropic");
  });

  test("publishes a successful writing-model discovery and clears provider errors", async () => {
    const actions = createActions();
    const clearError = vi.fn();
    const { result } = renderProviderControls(actions, clearError);

    await act(() => result.current.fetchAvailableModels());

    expect(mocks.fetchWriting).toHaveBeenCalledWith({
      endpoint: "https://openrouter.ai/api/v1",
      apiKey: "key",
    });
    expect(result.current.availableModels).toEqual(["writing-a", "writing-b"]);
    expect(clearError).toHaveBeenCalledOnce();
  });
});

function renderProviderControls(
  actions: ReturnType<typeof createActions>,
  clearError = vi.fn(),
) {
  const draft = draftFromStoredSettings(
    {
      transcription_mode: "local",
      local_model: "local",
      microphone_device: null,
      language: "en",
      llm_enabled: true,
      llm_provider: "openrouter",
      llm_endpoint: "",
      llm_api_key: "key",
      llm_model: "selected",
    } as StoredSettings,
    "default",
  );
  return renderHook(() =>
    useSettingsProviderControls({
      enabled: true,
      loading: false,
      licenseGateActive: true,
      draft,
      modelCatalog: [],
      actions,
      errorSourceTab: "providers",
      clearError,
      showError: vi.fn(),
    }),
  );
}

function createActions() {
  return {
    setLanguage: vi.fn<(value: string) => void>(),
    setLlmProvider: vi.fn(),
    setLlmEndpoint: vi.fn(),
    setLlmApiKey: vi.fn(),
    setLlmModel: vi.fn(),
    setRemoteSpeechProvider: vi.fn(),
    setRemoteSpeechEndpoint: vi.fn(),
    setRemoteSpeechApiKey: vi.fn(),
    setRemoteSpeechModel: vi.fn(),
  };
}
