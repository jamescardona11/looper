// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreenShell } from "./onboarding-screen-shell";

vi.mock("../../shared/ui/WindowControls", () => ({
  default: () => <div data-testid="window-controls" />,
}));
vi.mock("../../shared/ui/FAQModal", () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <button type="button" onClick={onClose}>
        Close FAQ
      </button>
    ) : null,
}));
vi.mock("./steps/shared", () => ({
  StepIndicator: ({
    currentStep,
    total,
  }: {
    currentStep: number;
    total: number;
  }) => (
    <output data-testid="step-indicator">
      {currentStep}/{total}
    </output>
  ),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

function renderShell(
  overrides: Partial<Parameters<typeof OnboardingScreenShell>[0]> = {},
) {
  const props: Parameters<typeof OnboardingScreenShell>[0] = {
    currentStep: "welcome",
    currentStepIndex: 0,
    totalSteps: 6,
    direction: 1,
    stepContent: <main>Step content</main>,
    bridges: null,
    onBack: vi.fn(),
    faqOpen: false,
    onCloseFaq: vi.fn(),
    licenseModal: null,
    ...overrides,
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <OnboardingScreenShell {...props} />
    </I18nProvider>,
  );
  return { props, ...view };
}

describe("OnboardingScreenShell", () => {
  it("keeps introduction chrome hidden while retaining the window surface", () => {
    renderShell();
    expect(screen.getByText("Step content")).toBeTruthy();
    expect(screen.getByTestId("window-controls")).toBeTruthy();
    expect(screen.queryByTestId("step-indicator")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("shows progress and routes back and FAQ actions on an intermediate step", () => {
    const onBack = vi.fn();
    const onCloseFaq = vi.fn();
    renderShell({
      currentStep: "model",
      currentStepIndex: 2,
      onBack,
      faqOpen: true,
      onCloseFaq,
    });

    expect(screen.getByTestId("step-indicator").textContent).toBe("2/6");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Close FAQ" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onCloseFaq).toHaveBeenCalledOnce();
  });

  it("keeps back navigation but hides progress on the completion step", () => {
    renderShell({
      currentStep: "done",
      currentStepIndex: 5,
      licenseModal: <aside>License choices</aside>,
    });
    expect(screen.queryByTestId("step-indicator")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByText("License choices")).toBeTruthy();
  });
});
