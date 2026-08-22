// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LicenseState } from "../../../../data/license";

const settings = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../../../data/settings", () => ({
  subscribeThemeChanged: settings.subscribe,
}));

vi.mock("../../queries", () => ({
  useDictationStats: () => ({ data: { totalWords: 1_234 } }),
}));

import MemberCard from "../MemberCard";

const i18n = setupI18n();
const translations = {
  "member_card.aria": "ACTIVE CARD DISTINCT",
  "member_card.draft_aria": "DRAFT CARD DISTINCT",
  "member_card.draft_idle": "PICK LICENSE DISTINCT",
  "member_card.draft_stamp_empty": "UNISSUED DISTINCT",
  "member_card.draft_stamp_issuing": "ISSUING DISTINCT",
  "member_card.tier_personal": "PERSONAL STAMP DISTINCT",
  "member_card.tier_commercial": "COMMERCIAL STAMP DISTINCT",
  "member_card.tier_founder": "FOUNDER STAMP DISTINCT",
  "member_card.tier_contributor": "CONTRIBUTOR STAMP DISTINCT",
  "member_card.tier_purchase_aria": "BUY TIER DISTINCT",
  "member_card.coverage_with_devices": "COVERAGE DISTINCT",
  "member_card.label_member_since": "MEMBER SINCE DISTINCT",
  "member_card.label_words_spoken": "WORDS SPOKEN DISTINCT",
};

const matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList;

const activeLicense = (
  edition: LicenseState["edition"] = "personal",
): LicenseState => ({
  status: "active",
  edition,
  displayKey: "LOOPER-ABCD",
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.test",
  purchasedAt: "2026-08-15T12:00:00Z",
  activationsCount: 2,
  licenseGateActive: true,
  trialActive: false,
  trialStartedAt: "2026-08-01T12:00:00Z",
  trialEndsAt: "2026-08-15T12:00:00Z",
  trialDaysRemaining: 0,
  activationsLimit: 5,
});

const withI18n = (node: React.ReactNode) => (
  <I18nProvider i18n={i18n}>{node}</I18nProvider>
);

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  vi.stubGlobal("matchMedia", matchMedia);
  settings.unsubscribe.mockReset();
  settings.subscribe.mockReset().mockResolvedValue(settings.unsubscribe);
  i18n.loadAndActivate({ locale: "distinct", messages: translations });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("MemberCard", () => {
  test("preserves the draft DOM, styling, translated IDs, and tier callbacks", () => {
    const openCheckout = vi.fn();
    const view = render(
      withI18n(
        <MemberCard
          active={false}
          licenseState={null}
          onOpenCheckout={openCheckout}
        />,
      ),
    );

    const card = screen.getByRole("article", { name: "DRAFT CARD DISTINCT" });
    expect(card.className).toBe(
      "relative flex flex-col overflow-visible text-left",
    );
    expect(card.style.width).toBe("400px");
    expect(card.style.height).toBe("257px");
    expect(card.style.minHeight).toBe("257px");
    expect(card.style.maxHeight).toBe("257px");
    expect(card.style.transform).toBe("rotate(-0.65deg)");
    expect(screen.getByText("UNISSUED DISTINCT").textContent).toBe(
      "UNISSUED DISTINCT",
    );
    expect(screen.getByText("PICK LICENSE DISTINCT").tagName).toBe("H2");

    const choices = screen.getAllByRole("button", {
      name: "BUY TIER DISTINCT",
    });
    expect(choices).toHaveLength(2);
    fireEvent.mouseEnter(choices[0]);
    expect(screen.getByRole("heading", { name: "Personal" }).textContent).toBe(
      "Personal",
    );
    expect(screen.getByText("$24.99").textContent).toBe("$24.99");
    fireEvent.click(choices[0]);
    expect(openCheckout).toHaveBeenCalledWith("personal");

    view.rerender(
      withI18n(
        <MemberCard
          active={false}
          licenseState={null}
          openingTarget="commercial"
          onOpenCheckout={openCheckout}
        />,
      ),
    );
    const busyChoices = screen.getAllByRole("button", {
      name: "BUY TIER DISTINCT",
    });
    expect((busyChoices[0] as HTMLButtonElement).disabled).toBe(true);
    expect((busyChoices[1] as HTMLButtonElement).disabled).toBe(false);
  });

  test("renders active identity and edition translations in the same frame", () => {
    const complete = vi.fn();
    render(
      withI18n(
        <MemberCard
          active
          licenseState={activeLicense()}
          onRevealComplete={complete}
        />,
      ),
    );

    const card = screen.getByRole("article", { name: "ACTIVE CARD DISTINCT" });
    expect(card.children).toHaveLength(2);
    expect((card.children[0] as HTMLElement).className).toBe(
      "pointer-events-none absolute inset-0 overflow-hidden",
    );
    const frame = card.children[1] as HTMLElement;
    expect(frame.className).toBe("relative z-[1] flex flex-col p-5 pb-0");
    expect(frame.children).toHaveLength(4);
    expect(screen.getAllByText("PERSONAL STAMP DISTINCT")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Ada Lovelace" }).tagName).toBe(
      "H2",
    );
    expect(screen.getByText("ada@example.test").tagName).toBe("P");
    expect(screen.getByText("MEMBER SINCE DISTINCT").tagName).toBe("DT");
    expect(screen.getByText("WORDS SPOKEN DISTINCT").tagName).toBe("DT");
    expect(screen.getByText("1,234").tagName).toBe("DD");
    expect(screen.getByText("COVERAGE DISTINCT").tagName).toBe("P");
    expect(complete).not.toHaveBeenCalled();
  });

  test.each([
    ["commercial", "COMMERCIAL STAMP DISTINCT"],
    ["founder", "FOUNDER STAMP DISTINCT"],
    ["contributor", "CONTRIBUTOR STAMP DISTINCT"],
  ] as const)("uses the %s translation ID", (edition, translatedStamp) => {
    render(
      withI18n(<MemberCard active licenseState={activeLicense(edition)} />),
    );
    expect(screen.getAllByText(translatedStamp)).toHaveLength(2);
  });

  test("uses the issuing translation while activation is in flight", () => {
    render(
      withI18n(
        <MemberCard
          active={false}
          activating
          activationAttempt={1}
          licenseState={null}
        />,
      ),
    );
    expect(screen.getByText("ISSUING DISTINCT").textContent).toBe(
      "ISSUING DISTINCT",
    );
  });
});
