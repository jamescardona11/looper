// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  KeyboardHero,
  OnboardingHeader,
  OnboardingStep,
  PRIMARY_BUTTON_CLASS,
  StepIndicator,
  type StepMotionProps,
} from "../shared";

const motionProps: StepMotionProps = {
  custom: -1,
  variants: {},
  animate: "center",
  exit: "exit",
  transition: { duration: 0, ease: "linear" },
};

afterEach(cleanup);

describe("shared onboarding presentation", () => {
  test("preserves the step frame hierarchy and layout classes", () => {
    render(
      <OnboardingStep
        stepKey="sample"
        motionProps={motionProps}
        widthClass="max-w-lg"
        align="center"
        footer={<button type="button">Footer</button>}
      >
        <span>Content</span>
      </OnboardingStep>,
    );

    const content = screen.getByText("Content");
    expect(content.parentElement?.className).toBe(
      "onboarding-step onboarding-step-sample flex min-h-full w-full max-w-lg flex-col items-center text-center justify-center",
    );
    expect(
      screen.getByRole("button", { name: "Footer" }).parentElement?.className,
    ).toBe("mt-9 flex w-full flex-col items-center gap-2.5");
  });

  test("renders the shared header and indicator structure", () => {
    const { container } = render(
      <>
        <OnboardingHeader title="Title" subtitle="Subtitle" />
        <StepIndicator currentStep={1} total={3} />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
    expect(screen.getByText("Subtitle")).toBeTruthy();
    expect(container.querySelectorAll(".bg-cloud")).toHaveLength(3);
  });

  test("keeps the keyboard geometry and highlighted shortcut key", () => {
    const { container } = render(<KeyboardHero keyLabel="Fn" />);
    const keyboard = container.querySelector('[aria-hidden="true"]');
    expect(keyboard?.children).toHaveLength(3);
    expect(keyboard?.querySelectorAll(":scope > div > span")).toHaveLength(33);
    expect(screen.getByText("Fn").className).toContain(
      "text-[var(--color-accent)]",
    );
  });

  test("preserves the primary action class contract", () => {
    expect(PRIMARY_BUTTON_CLASS).toBe(
      "onboarding-primary-action flex min-w-[160px] items-center justify-center gap-2 rounded-lg bg-content-primary px-6 py-2.5 ui-text-body-lg font-semibold text-surface-secondary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
    );
  });
});
