// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ModelInfo } from "../../../contracts/models";
import ModelPickerModal, { ModelPickerPanel } from "../ModelPickerModal";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function model(overrides: Partial<ModelInfo>): ModelInfo {
  return {
    key: "parakeet-q8",
    label: "Parakeet (Q8)",
    description: "Local model",
    size_mb: 700,
    engine_id: "parakeet",
    family: "parakeet",
    variant: "Q8_0",
    category: "standard",
    downloadable: true,
    tags: [],
    capabilities: ["streaming", "timestamps"],
    supported_languages: [{ code: "en", name: "English" }],
    language_selection_mode: "user_select",
    ane_size_mb: null,
    ...overrides,
  };
}

const catalog = [
  model({ key: "parakeet-q5", variant: "Q5_0", size_mb: 600 }),
  model({ key: "parakeet-q8", variant: "Q8_0", size_mb: 700 }),
  model({
    key: "legacy",
    family: "legacy",
    label: "Legacy Model",
    category: "legacy",
    variant: "Full",
  }),
];

function renderPanel(
  overrides: { isInstalled?: (key: string) => boolean } = {},
) {
  const actions = {
    onUse: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
  };
  render(
    <I18nProvider i18n={i18n}>
      <ModelPickerPanel
        catalog={catalog}
        activeKey=""
        isInstalled={overrides.isInstalled ?? (() => false)}
        progressFor={() => undefined}
        {...actions}
      />
    </I18nProvider>,
  );
  return actions;
}

afterEach(cleanup);

describe("ModelPicker", () => {
  test("selects a family variant before downloading it", () => {
    const actions = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Q5_0" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Parakeet/ })[0]!);

    expect(actions.onDownload).toHaveBeenCalledWith("parakeet-q5", false);
  });

  test("searches models and exposes the empty state", () => {
    renderPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No models match your search.")).toBeTruthy();
  });

  test("uses and deletes an installed model", () => {
    const actions = renderPanel({ isInstalled: () => true });
    fireEvent.click(screen.getAllByRole("button", { name: /Parakeet/ })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(actions.onUse).toHaveBeenCalledWith("parakeet-q8");
    expect(actions.onDelete).toHaveBeenCalledWith("parakeet-q8");
  });

  test("opens and dismisses the modal shell", () => {
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
    expect(screen.getByRole("dialog", { name: "Choose a model" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
