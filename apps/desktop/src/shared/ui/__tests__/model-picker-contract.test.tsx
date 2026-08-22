// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { DownloadEvent, ModelInfo } from "../../../contracts/models";
import ModelPickerModal, { ModelPickerPanel } from "../ModelPickerModal";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function model(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    key: "parakeet",
    label: "Parakeet",
    description: "Local model",
    size_mb: 700,
    engine_id: "parakeet",
    family: "parakeet",
    variant: "Q8_0",
    category: "standard",
    downloadable: true,
    tags: [],
    capabilities: [],
    supported_languages: [{ code: "en", name: "English" }],
    language_selection_mode: "user_select",
    ane_size_mb: null,
    ...overrides,
  };
}

type PanelOptions = {
  catalog: ModelInfo[];
  progress?: DownloadEvent;
  isInstalled?: (key: string) => boolean;
};

function renderPanel(options: PanelOptions) {
  const actions = {
    onUse: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
  };
  render(
    <I18nProvider i18n={i18n}>
      <ModelPickerPanel
        catalog={options.catalog}
        activeKey=""
        isInstalled={options.isInstalled ?? (() => false)}
        isAneInstalled={() => false}
        progressFor={() => options.progress}
        {...actions}
      />
    </I18nProvider>,
  );
  return actions;
}

afterEach(cleanup);

describe("ModelPicker presentation contract", () => {
  test("filters the catalog through the category menu", () => {
    renderPanel({
      catalog: [
        model(),
        model({
          key: "legacy",
          label: "Legacy Model",
          family: "legacy",
          category: "legacy",
        }),
      ],
    });

    const filter = screen.getByRole("button", {
      name: "Filter models by category",
    });
    fireEvent.click(filter);
    const legacy = screen.getByRole("menuitemradio", { name: "Legacy" });
    expect(legacy.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(legacy);

    expect(screen.queryByText("Parakeet")).toBeNull();
    expect(screen.getByText("Legacy Model")).toBeTruthy();
    expect(filter.getAttribute("aria-expanded")).toBe("false");
  });

  test("passes the current Neural Engine choice into downloads", () => {
    const actions = renderPanel({
      catalog: [model({ ane_size_mb: 200 })],
    });
    const ane = screen.getByRole("checkbox", { name: "ANE" });
    const choose = screen.getByRole("button", { name: /Parakeet/ });

    expect(ane.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(choose);
    expect(actions.onDownload).toHaveBeenLastCalledWith("parakeet", true);
    fireEvent.click(ane);
    expect(ane.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(choose);
    expect(actions.onDownload).toHaveBeenLastCalledWith("parakeet", false);
  });

  test("renders live progress and routes cancellation", () => {
    const actions = renderPanel({
      catalog: [model()],
      progress: {
        status: "downloading",
        percent: 42,
        file: "weights.bin",
      },
    });

    expect(screen.getByText("42% · weights.bin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions.onCancel).toHaveBeenCalledWith("parakeet");
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
  });

  test("only dismisses the modal from its shell or close action", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <ModelPickerModal
          open
          onClose={onClose}
          catalog={[]}
          activeKey=""
          isInstalled={() => false}
          progressFor={() => undefined}
          onUse={vi.fn()}
          onDownload={vi.fn()}
          onDelete={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: "Choose a model" });
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
