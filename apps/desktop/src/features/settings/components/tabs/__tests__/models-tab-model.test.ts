import { describe, expect, test } from "vitest";
import {
  cloudModelSelection,
  installedModelCatalog,
  selectLocalModel,
} from "../models-tab-model";
import type { ModelInfo, ModelStatus } from "../../../../../types";

const model = (key: string, overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  key,
  label: key,
  description: key,
  size_mb: 500,
  engine_id: "nvidia",
  variant: "int8",
  tags: [],
  capabilities: [],
  supported_languages: [{ code: "en", name: "English" }],
  family: "speech",
  category: "speech",
  downloadable: true,
  language_selection_mode: "auto_detect",
  ane_size_mb: null,
  ...overrides,
});

const status = (key: string, installed: boolean): ModelStatus => ({
  key,
  installed,
  ane_installed: false,
  bytes_on_disk: 0,
  missing_files: [],
  directory: "",
});

describe("models tab model", () => {
  test("preserves configured, installed, recommended and smallest fallback order", () => {
    const catalog = [
      model("large", { size_mb: 1_000 }),
      model("recommended", { tags: ["recommended"], size_mb: 800 }),
      model("small", { size_mb: 200 }),
    ];
    expect(
      selectLocalModel(catalog, "large", {} as Record<string, ModelStatus>)
        ?.key,
    ).toBe("large");
    expect(
      selectLocalModel(catalog, "missing", {
        small: status("small", true),
      })?.key,
    ).toBe("small");
    expect(selectLocalModel(catalog, "missing", {})?.key).toBe("recommended");
    expect(
      selectLocalModel(
        catalog.map((candidate) => ({ ...candidate, tags: [] })),
        "missing",
        {},
      )?.key,
    ).toBe("small");
    expect(
      installedModelCatalog(catalog, {
        small: status("small", true),
        large: status("large", false),
      }).map(({ key }) => key),
    ).toEqual(["small"]);
  });

  test("routes built-in and remote cloud selections to their settings owner", () => {
    expect(
      cloudModelSelection({
        transcriptionMode: "cloud",
        remoteEnabled: false,
        remoteProvider: "openai",
        remoteModel: "",
      }),
    ).toMatchObject({
      active: true,
      providerLabel: "Looper Cloud",
      settingsTarget: "general",
    });
    expect(
      cloudModelSelection({
        transcriptionMode: "local",
        remoteEnabled: true,
        remoteProvider: "openai",
        remoteModel: "gpt-4o-transcribe",
      }),
    ).toEqual({
      active: true,
      providerLabel: "OpenAI",
      modelLabel: "gpt-4o-transcribe",
      settingsTarget: "providers",
    });
  });
});
