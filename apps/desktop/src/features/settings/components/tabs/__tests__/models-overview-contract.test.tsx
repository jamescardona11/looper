// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ModelInfo, ModelStatus } from "../../../../../types";
import { ModelsOverview } from "../ModelsOverview";

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "contract",
  messages: {
    "settings.models.card.active": "CLOUD-ACTIVE-UNIQUE",
    "settings.models.card.fallback": "LOCAL-FALLBACK-UNIQUE",
    "settings.models.installed": "INSTALLED-TITLE-UNIQUE",
    "settings.models.browse_all": "BROWSE-MODELS-UNIQUE",
    "settings.models.installed.use": "USE-MODEL-UNIQUE",
    "settings.models.installed.delete_model": "DELETE-MODEL-UNIQUE",
  },
});

const model: ModelInfo = {
  key: "parakeet",
  label: "Parakeet TDT",
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

const installed: ModelStatus = {
  key: model.key,
  installed: true,
  ane_installed: false,
  bytes_on_disk: 600_000_000,
  missing_files: [],
  directory: "/models/parakeet",
};

afterEach(cleanup);

describe("ModelsOverview contract", () => {
  test("routes cloud, browse and installed-model actions without changing layout", () => {
    const onUse = vi.fn();
    const onDelete = vi.fn();
    const onBrowse = vi.fn();
    const onOpenProviders = vi.fn();
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ModelsOverview
          catalog={[model]}
          status={{ [model.key]: installed }}
          progress={{}}
          localModel={model.key}
          transcriptionMode="local"
          remoteSpeechEnabled
          remoteSpeechProvider="openai"
          remoteSpeechModel="gpt-4o-mini-transcribe"
          onUse={onUse}
          onDownload={vi.fn()}
          onDelete={onDelete}
          onCancel={vi.fn()}
          onBrowse={onBrowse}
          onOpenGeneral={vi.fn()}
          onOpenProviders={onOpenProviders}
        />
      </I18nProvider>,
    );

    expect(container.firstElementChild?.className).toBe(
      "flex h-full min-h-0 flex-col gap-5",
    );
    expect(screen.getByText("CLOUD-ACTIVE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("LOCAL-FALLBACK-UNIQUE")).toBeTruthy();
    expect(screen.getByText("INSTALLED-TITLE-UNIQUE")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "OpenAI cloud model, manage in Providers",
      }),
    );
    expect(onOpenProviders).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "BROWSE-MODELS-UNIQUE" }),
    );
    expect(onBrowse).toHaveBeenCalledOnce();

    const row = screen
      .getAllByRole("article")
      .find((article) => !article.hasAttribute("aria-label"));
    if (!row) throw new Error("Installed model row was not rendered");
    expect(row.className).toBe(
      "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-elevated/40",
    );
    fireEvent.click(
      within(row).getByRole("button", { name: "USE-MODEL-UNIQUE" }),
    );
    expect(onUse).toHaveBeenCalledWith(model.key);
    fireEvent.click(
      within(row).getByRole("button", { name: "DELETE-MODEL-UNIQUE" }),
    );
    expect(onDelete).toHaveBeenCalledWith(model.key);
  });
});
