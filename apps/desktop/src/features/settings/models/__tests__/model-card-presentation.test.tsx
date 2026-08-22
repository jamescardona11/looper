// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ModelStatCard from "../ModelStatCard";
import { buildModelCardPresentation } from "../model-card-presentation";
import type { ModelInfo, ModelStatus } from "../../../../contracts/index";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const model: ModelInfo = {
  key: "parakeet",
  label: "Parakeet",
  description: "Local speech model",
  size_mb: 600,
  engine_id: "nvidia",
  variant: "int8",
  tags: ["multilingual"],
  capabilities: ["transcription"],
  supported_languages: [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
  ],
  family: "parakeet",
  category: "speech",
  downloadable: true,
  language_selection_mode: "auto_detect",
  ane_size_mb: null,
};

const installedStatus: ModelStatus = {
  key: "parakeet",
  installed: true,
  ane_installed: false,
  bytes_on_disk: 600_000_000,
  missing_files: [],
  directory: "/models/parakeet",
};

describe("model card presentation", () => {
  test("derives a bounded partial signal and download filename", () => {
    const presentation = buildModelCardPresentation(
      model,
      undefined,
      {
        status: "downloading",
        file: "/tmp/parakeet.bin",
        percent: 50,
      },
      false,
      true,
    );

    expect(presentation.activity).toEqual({
      kind: "downloading",
      fileName: "parakeet.bin",
      percent: 50,
    });
    expect(presentation.action).toBe("cancel");
    expect(presentation.dots.length).toBeGreaterThan(0);
    expect(presentation.dots.every((dot) => dot % 44 < 22)).toBe(true);
  });

  test("keeps delete actions from selecting the surrounding model card", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <ModelStatCard
          model={model}
          status={installedStatus}
          selected
          onSelect={onSelect}
          onDelete={onDelete}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete model" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
