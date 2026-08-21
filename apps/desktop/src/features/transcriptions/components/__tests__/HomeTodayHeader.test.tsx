// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../homeHeaderStats", () => ({
  labelForTodayStatSlide: () => "",
}));

import { EMPTY_TODAY_DICTATION_STATS } from "../../todayStats";
import HomeTodayHeader from "../HomeTodayHeader";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HomeTodayHeader", () => {
  test("keeps the date and greeting hierarchy while stats are loading", () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <HomeTodayHeader
          transcriptionsFetched={false}
          stats={EMPTY_TODAY_DICTATION_STATS}
          active={false}
        />
      </I18nProvider>,
    );

    const header = container.querySelector("header") as HTMLElement;
    expect(header.className).toBe("mb-6 shrink-0");
    expect(header.children).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Good morning" }).className,
    ).toBe(
      "mt-1 font-display ui-text-screen-title ui-color-primary font-semibold",
    );
    expect(header.firstElementChild?.className).toBe(
      "ui-text-uppercase-micro ui-color-muted capitalize",
    );
  });
});
