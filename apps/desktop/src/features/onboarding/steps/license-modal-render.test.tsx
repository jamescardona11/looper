// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LicenseState } from "../../../data/license";
import type { PurchaseTier } from "../../license/purchaseConfig";
import { LicenseModal } from "./LicenseModal";

type MemberCardTestProps = {
  active: boolean;
  activationAttempt: number;
  onOpenCheckout: (tier: PurchaseTier) => void;
  onRevealComplete: () => void;
};

vi.mock("../../license/components/MemberCard", () => ({
  default: (props: MemberCardTestProps) => (
    <div
      data-testid="member-card"
      data-active={String(props.active)}
      data-attempt={String(props.activationAttempt)}
    >
      <button type="button" onClick={() => props.onOpenCheckout("personal")}>
        Checkout
      </button>
      <button type="button" onClick={props.onRevealComplete}>
        Reveal complete
      </button>
    </div>
  ),
}));

vi.mock("../../license/components/CustomerPortalLink", () => ({
  default: ({ className }: { className: string }) => (
    <button type="button" className={className}>
      Customer portal
    </button>
  ),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const activeLicense: LicenseState = {
  status: "active",
  licenseGateActive: true,
  trialActive: false,
  trialStartedAt: "",
  trialEndsAt: "",
  trialDaysRemaining: 0,
  activationsLimit: 3,
};

const renderLicense = (
  overrides: Partial<React.ComponentProps<typeof LicenseModal>> = {},
) => {
  const props: React.ComponentProps<typeof LicenseModal> = {
    licenseState: null,
    licenseLoading: false,
    activating: false,
    openingTarget: null,
    openError: null,
    activationError: null,
    onOpenCheckout: vi.fn(),
    onActivateLicense: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const rendered = render(
    <I18nProvider i18n={i18n}>
      <LicenseModal {...props} />
    </I18nProvider>,
  );
  return { props, ...rendered };
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LicenseModal", () => {
  test("submits a trimmed key, increments the attempt, and forwards checkout", () => {
    const { props } = renderLicense();
    expect(screen.getByText("Dictation is free forever")).toBeTruthy();
    const activate = screen.getByRole("button", { name: "Activate" });
    const dialog = screen.getByRole("dialog", { name: "License" });
    expect(dialog.className).toBe(
      "relative flex w-full max-w-[400px] flex-col items-center gap-4",
    );
    expect(dialog.parentElement?.className).toBe(
      "fixed inset-0 z-50 flex items-center justify-center bg-black/88 px-6 backdrop-blur-2xl",
    );
    expect(screen.getByRole("textbox", { name: "License key" }).className).toBe(
      "min-w-0 flex-1 bg-transparent px-0.5 py-2 font-mono ui-text-body-sm text-white placeholder-white/35 outline-none",
    );
    expect((activate as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "License key" }), {
      target: { value: "  ABC-123  " },
    });
    fireEvent.click(activate);
    expect(props.onActivateLicense).toHaveBeenCalledWith("ABC-123");
    expect(screen.getByTestId("member-card").dataset.attempt).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
    expect(props.onOpenCheckout).toHaveBeenCalledWith("personal");
  });

  test("stops inner clicks and closes from the backdrop or close button", () => {
    const { props } = renderLicense();
    const dialog = screen.getByRole("dialog", { name: "License" });
    fireEvent.click(dialog);
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  test("hides activation UI for an active license and dismisses after reveal", () => {
    vi.useFakeTimers();
    const { props } = renderLicense({ licenseState: activeLicense });
    expect(screen.queryByRole("textbox", { name: "License key" })).toBeNull();
    expect(screen.getByTestId("member-card").dataset.active).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Reveal complete" }));
    act(() => vi.advanceTimersByTime(1499));
    expect(props.onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("clears a scheduled reveal dismissal when unmounted", () => {
    vi.useFakeTimers();
    const { props, unmount } = renderLicense({ licenseState: activeLicense });
    fireEvent.click(screen.getByRole("button", { name: "Reveal complete" }));
    unmount();
    act(() => vi.runAllTimers());
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("shows activation errors before checkout errors", () => {
    const { rerender } = renderLicense({
      activationError: "Activation failed",
      openError: "Checkout failed",
    });
    expect(screen.getByText("Activation failed")).toBeTruthy();
    expect(screen.queryByText("Checkout failed")).toBeNull();

    rerender(
      <I18nProvider i18n={i18n}>
        <LicenseModal
          licenseState={null}
          licenseLoading={false}
          activating={false}
          openingTarget={null}
          openError="Checkout failed"
          activationError={null}
          onOpenCheckout={vi.fn()}
          onActivateLicense={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Checkout failed")).toBeTruthy();
  });
});
