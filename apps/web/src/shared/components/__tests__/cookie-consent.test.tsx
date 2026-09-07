import { I18nProvider } from "@looper/i18n/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/analytics", () => ({
  initPostHog: vi.fn(),
  optOutPostHog: vi.fn(),
}));

import { CookieConsent } from "../cookie-consent";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.removeItem("cookie-consent");
  document.documentElement.style.removeProperty("--cookie-consent-height");
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(76);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  document.documentElement.style.removeProperty("--cookie-consent-height");
});

function renderConsent() {
  return render(
    <I18nProvider defaultLocale="en">
      <CookieConsent />
    </I18nProvider>,
  );
}

describe("CookieConsent", () => {
  it("reserves its measured height until the visitor makes a choice", () => {
    renderConsent();

    act(() => vi.advanceTimersByTime(1500));

    expect(screen.getByTestId("cookie-consent")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--cookie-consent-height")).toBe("76px");

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(screen.queryByTestId("cookie-consent")).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--cookie-consent-height")).toBe("");
  });

  it("keeps both mobile decisions at touch size", () => {
    renderConsent();

    act(() => vi.advanceTimersByTime(1500));

    expect(screen.getByRole("button", { name: "Decline" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Accept" })).toHaveClass("min-h-11");
  });
});
