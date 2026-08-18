// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WelcomeStep } from "./WelcomeStep";
import { PRIMARY_BUTTON_CLASS, type StepMotionProps } from "./shared";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const motionProps: StepMotionProps = {
  custom: 1,
  variants: {},
  animate: "center",
  exit: "exit",
  transition: { duration: 0, ease: "easeOut" },
};

const renderWelcome = (overrides = {}) => {
  const props: React.ComponentProps<typeof WelcomeStep> = {
    stepMotionProps: motionProps,
    hasStepTransitioned: false,
    onStart: vi.fn(),
    startDisabled: false,
    ...overrides,
  };
  render(
    <I18nProvider i18n={i18n}>
      <WelcomeStep {...props} />
    </I18nProvider>,
  );
  return props;
};

afterEach(cleanup);

describe("WelcomeStep", () => {
  test("renders the product wordmark, tagline, and underline contract", () => {
    renderWelcome();

    const title = screen.getByRole("heading", { name: "Looper" });
    expect(title.style.fontFamily).toBe("var(--font-display)");
    expect(title.className).toBe(
      "text-[3.5rem] font-bold leading-none tracking-[-0.03em] text-content-primary",
    );
    expect(screen.getByText("Free dictation anywhere")).toBeTruthy();
    const underline = document.querySelector('path[d="M 4 11 Q 150 5, 296 6"]');
    expect(underline?.getAttribute("stroke")).toBe("var(--color-local)");
    const content = title.closest(".min-h-full");
    expect(Array.from(content?.children ?? [], (node) => node.tagName)).toEqual(
      ["DIV", "SPAN", "P", "BUTTON"],
    );
  });

  test("starts onboarding from the enabled CTA", () => {
    const props = renderWelcome();
    const button = screen.getByRole("button", { name: "Get started" });
    expect(button.className).toBe(
      `mt-[13vh] ${PRIMARY_BUTTON_CLASS} disabled:opacity-60`,
    );
    fireEvent.click(button);
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  test("does not start onboarding while the CTA is disabled", () => {
    const props = renderWelcome({ startDisabled: true });
    const button = screen.getByRole("button", { name: "Get started" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(props.onStart).not.toHaveBeenCalled();
  });
});
