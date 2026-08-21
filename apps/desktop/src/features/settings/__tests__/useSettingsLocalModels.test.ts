// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AppLocaleSetting, ModelInfo } from "../../../types";

const mocks = vi.hoisted(() => ({ useModelTransfers: vi.fn() }));

vi.mock("../useModelTransfers", () => ({
  useModelTransfers: mocks.useModelTransfers,
}));

import { useSettingsLocalModels } from "../useSettingsLocalModels";

const model = (key: string, options: Partial<ModelInfo> = {}): ModelInfo => ({
  key,
  label: key,
  description: "",
  size_mb: 1,
  engine_id: key,
  variant: "default",
  tags: [],
  capabilities: [],
  supported_languages: [{ code: "en", name: "English" }],
  family: "test",
  category: "local",
  downloadable: true,
  language_selection_mode: "user_select",
  ane_size_mb: null,
  ...options,
});

const setNavigatorLanguage = (value: string) => {
  Object.defineProperty(window.navigator, "language", {
    value,
    configurable: true,
  });
};

const renderLocalModels = (options: {
  catalog: ModelInfo[];
  appLocale: AppLocaleSetting;
  language: string;
  remoteSpeechActive?: boolean;
}) => {
  const save = vi.fn().mockResolvedValue(true);
  const setLanguage = vi.fn();
  const { result } = renderHook(() =>
    useSettingsLocalModels({
      enabled: true,
      catalog: options.catalog,
      statusByModel: {},
      selectedModel: "selected",
      appLocale: options.appLocale,
      language: options.language,
      remoteSpeechActive: options.remoteSpeechActive ?? false,
      setSelectedModel: vi.fn(),
      setLanguage,
      cancelScheduledSave: vi.fn(),
      save,
    }),
  );
  return { result, save, setLanguage };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useModelTransfers.mockReturnValue({
    downloadState: {},
    download: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
  });
  setNavigatorLanguage("en-US");
});

describe("settings local model selection", () => {
  test("adopts the system locale when no language is set", () => {
    setNavigatorLanguage("es-ES");
    const catalog = [
      model("replacement", {
        supported_languages: [{ code: "es", name: "Español" }],
      }),
    ];
    const { result, save, setLanguage } = renderLocalModels({
      catalog,
      appLocale: "system",
      language: "",
    });

    act(() => result.current.select("replacement"));

    expect(setLanguage).toHaveBeenCalledWith("es");
    expect(save).toHaveBeenCalledWith({
      localModel: "replacement",
      language: "es",
    });
  });

  test("falls back to english when the locale is unsupported", () => {
    setNavigatorLanguage("fr-FR");
    const { result, save } = renderLocalModels({
      catalog: [model("replacement")],
      appLocale: "system",
      language: "",
    });

    act(() => result.current.select("replacement"));

    expect(save).toHaveBeenCalledWith({
      localModel: "replacement",
      language: "en",
    });
  });

  test("prefers the explicit app locale over the system locale", () => {
    setNavigatorLanguage("en-US");
    const catalog = [
      model("replacement", {
        supported_languages: [{ code: "es", name: "Español" }],
      }),
    ];
    const { result, save } = renderLocalModels({
      catalog,
      appLocale: "es",
      language: "",
    });

    act(() => result.current.select("replacement"));

    expect(save).toHaveBeenCalledWith({
      localModel: "replacement",
      language: "es",
    });
  });

  test("clears a language the selected model cannot transcribe", () => {
    const { result, save } = renderLocalModels({
      catalog: [model("replacement")],
      appLocale: "system",
      language: "fr",
    });

    act(() => result.current.select("replacement"));

    expect(save).toHaveBeenCalledWith({
      localModel: "replacement",
      language: "",
    });
  });

  test("keeps the current language for a model outside the catalog", () => {
    const { result, save } = renderLocalModels({
      catalog: [model("replacement")],
      appLocale: "system",
      language: "",
      remoteSpeechActive: true,
    });

    act(() => result.current.select("unknown"));

    expect(save).toHaveBeenCalledWith({
      localModel: "unknown",
      language: "",
    });
  });
});
