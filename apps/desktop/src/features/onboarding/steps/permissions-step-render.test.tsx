// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PermissionsStep } from "./PermissionsStep";
import { PRIMARY_BUTTON_CLASS, type StepMotionProps } from "./shared";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const stepMotionProps: StepMotionProps = {
  custom: 1,
  variants: {},
  animate: "center",
  exit: "exit",
  transition: { duration: 0, ease: "easeOut" },
};

const renderPermissions = (
  overrides: Partial<React.ComponentProps<typeof PermissionsStep>> = {},
) => {
  const props: React.ComponentProps<typeof PermissionsStep> = {
    stepMotionProps,
    requiresMicrophone: true,
    requiresAccessibility: false,
    micPermission: false,
    accessibilityPermission: false,
    isCheckingMic: false,
    isCheckingAccessibility: false,
    onRequestMic: vi.fn(),
    onRequestAccessibility: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider i18n={i18n}>
      <PermissionsStep {...props} />
    </I18nProvider>,
  );
  return props;
};

afterEach(cleanup);

describe("PermissionsStep", () => {
  test("requests a missing microphone permission while Continue stays disabled", () => {
    const props = renderPermissions();
    expect(screen.getByText("Hears your voice.")).toBeTruthy();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    expect(continueButton.className).toBe(PRIMARY_BUTTON_CLASS);
    const grantButton = screen.getByRole("button", { name: "Grant" });
    expect(grantButton.className).toBe(
      "shrink-0 ui-text-body-sm-strong text-cloud underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50",
    );
    expect(screen.getByText("Microphone").closest(".py-4")?.className).toBe(
      "flex items-center gap-4 py-4 text-left",
    );
    fireEvent.click(grantButton);
    expect(props.onRequestMic).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  test("disables the permission action and shows progress while checking", () => {
    renderPermissions({ isCheckingMic: true });
    const grant = screen.getByRole("button", { name: "Grant" });
    expect((grant as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  test("enables Continue and hides the action after every requirement is granted", () => {
    const props = renderPermissions({ micPermission: true });
    expect(screen.queryByRole("button", { name: "Grant" })).toBeNull();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector(".bg-emerald-500")).toBeTruthy();
    fireEvent.click(continueButton);
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  test("keeps the macOS accessibility action independent from microphone", () => {
    const props = renderPermissions({
      requiresMicrophone: false,
      requiresAccessibility: true,
    });
    expect(screen.getByText("Types text into any app.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enable in Settings" }));
    expect(props.onRequestAccessibility).toHaveBeenCalledTimes(1);
    expect(props.onRequestMic).not.toHaveBeenCalled();
  });

  test("allows Continue when the platform requires no native permissions", () => {
    renderPermissions({ requiresMicrophone: false });
    expect(screen.queryByText("Microphone")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
