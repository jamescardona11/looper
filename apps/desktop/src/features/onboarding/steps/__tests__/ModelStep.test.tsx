// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ModelInfo } from "../../../../types";
import { ModelStep } from "../ModelStep";
import type { StepMotionProps } from "../shared";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const stepMotionProps: StepMotionProps = {
  custom: 1,
  variants: {},
  animate: "center",
  exit: "exit",
  transition: { duration: 0, ease: "easeOut" },
};

const model = (key: string, label: string, engineId: string): ModelInfo => ({
  key,
  label,
  description: `${label} description`,
  size_mb: engineId === "cohere" ? 2_000 : 670,
  engine_id: engineId,
  family: engineId,
  variant: "Int8",
  category: "standard",
  downloadable: true,
  tags: engineId === "nvidia" ? ["Recommended"] : [],
  capabilities: [],
  supported_languages: [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
  ],
  language_selection_mode:
    engineId === "nvidia" ? "auto_detect" : "user_select",
  ane_size_mb: null,
});

const models = [
  model("parakeet_tdt_int8", "Parakeet TDT V3", "nvidia"),
  model("cohere_transcribe_int4", "Cohere Transcribe", "cohere"),
];

const renderStep = (
  overrides: Partial<React.ComponentProps<typeof ModelStep>> = {},
) => {
  const props: React.ComponentProps<typeof ModelStep> = {
    stepMotionProps,
    models,
    selectedModelKey: "parakeet_tdt_int8",
    modelStatus: {},
    isLoading: false,
    unavailable: false,
    displayStateByModel: {},
    selectedModelReady: false,
    showLocalConfirm: false,
    onShowConfirm: vi.fn(),
    onSelectModel: vi.fn(),
    onDownload: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider i18n={i18n}>
      <ModelStep {...props} />
    </I18nProvider>,
  );
  return props;
};

afterEach(cleanup);

describe("ModelStep", () => {
  test("shows Parakeet and Cohere as selectable local models", () => {
    const props = renderStep();

    const parakeet = screen.getByRole("radio", {
      name: "Parakeet TDT V3 model",
    });
    const cohere = screen.getByRole("radio", {
      name: "Cohere Transcribe model",
    });
    expect(screen.getByRole("radiogroup").className).toBe(
      "grid w-full justify-items-center gap-4 grid-cols-2",
    );

    expect(parakeet.getAttribute("aria-checked")).toBe("true");
    expect(cohere.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(cohere);
    expect(props.onSelectModel).toHaveBeenCalledWith("cohere_transcribe_int4");
  });

  test("downloads the selected Cohere model from the confirmation", () => {
    const props = renderStep({
      selectedModelKey: "cohere_transcribe_int4",
      showLocalConfirm: true,
    });

    expect(screen.getByText("Cohere Transcribe · 2.0 GB")).toBeTruthy();
    expect(
      screen.getByText(
        "The download continues in the background while you finish setup.",
      ),
    ).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toBe(
      "w-full max-w-sm rounded-2xl border border-border-primary bg-surface-tertiary p-6 text-center ui-shadow-modal-deep",
    );
    expect(dialog.parentElement?.className).toBe(
      "fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-xs",
    );
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(props.onDownload).toHaveBeenCalledWith("cohere_transcribe_int4");
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  test("requests confirmation for an uninstalled model and advances when ready", () => {
    const pending = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(pending.onShowConfirm).toHaveBeenCalledWith(true);
    expect(pending.onNext).not.toHaveBeenCalled();
    cleanup();

    const ready = renderStep({ selectedModelReady: true });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(ready.onNext).toHaveBeenCalledTimes(1);
    expect(ready.onShowConfirm).not.toHaveBeenCalled();
  });

  test("continues without downloading and dismisses the confirmation", async () => {
    const props = renderStep({ showLocalConfirm: true });
    fireEvent.click(screen.getByRole("button", { name: "Continue anyway" }));

    expect(props.onShowConfirm).toHaveBeenCalledWith(false);
    expect(props.onDownload).not.toHaveBeenCalled();
    expect(props.onNext).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("keeps loading and unavailable catalog states non-destructive", () => {
    const loading = renderStep({ isLoading: true });
    expect(screen.getByText("Finding a model for your device")).toBeTruthy();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(continueButton);
    expect(loading.onNext).not.toHaveBeenCalled();
    cleanup();

    renderStep({ models: [], unavailable: true });
    expect(
      screen.getByText(
        "Model list unavailable. You can add one later in Settings.",
      ),
    ).toBeTruthy();
  });

  test("keeps the dialog open for inner clicks and closes it from the backdrop", () => {
    const props = renderStep({ showLocalConfirm: true });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(props.onShowConfirm).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(props.onShowConfirm).toHaveBeenCalledWith(false);
  });
});
