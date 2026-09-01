// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import CaptureStatusCard, { type SignalStage } from "../CaptureStatusCard";

vi.mock("../../../../shared/ui/AnimatedCount", () => ({
  default: ({ value }: { value: number }) => <>{value}</>,
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderStage = (
  stage: SignalStage,
  overrides: Partial<ComponentProps<typeof CaptureStatusCard>> = {},
) =>
  render(
    <I18nProvider i18n={i18n}>
      <CaptureStatusCard stage={stage} {...overrides} />
    </I18nProvider>,
  );

describe("CaptureStatusCard", () => {
  test("keeps the signal journey hidden while ready", () => {
    renderStage("ready");

    expect(screen.getByText("Ready to write anywhere")).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Dictation progress" }),
    ).toBeNull();
  });

  test.each([
    ["listening", "Listening…", "Listening"],
    ["transcribing", "Transcribing locally…", "Transcribing"],
    ["writing", "Writing…", "Writing"],
    ["inserted", "Inserted", "Inserted"],
  ] as const)(
    "announces the %s runtime stage without replacing the journey",
    (stage, title, currentStep) => {
      renderStage(stage);

      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      expect(
        screen.getByRole("listitem", { current: "step" }).textContent,
      ).toBe(currentStep);
    },
  );

  test("distinguishes completed, current, and upcoming journey steps", () => {
    const { container } = renderStage("writing");

    expect(
      container.querySelectorAll('[data-stage-state="complete"]'),
    ).toHaveLength(2);
    expect(
      container
        .querySelector('[data-stage-state="current"]')
        ?.getAttribute("data-stage"),
    ).toBe("writing");
    expect(
      container.querySelectorAll('[data-stage-state="upcoming"]'),
    ).toHaveLength(1);
  });

  test("matches the weekly signal anatomy without a redundant metrics footer", () => {
    const { container } = renderStage("ready", {
      weeklyActivity: {
        days: [
          { day: "L", height: 10, words: 100 },
          { day: "M", height: 20, words: 200 },
          { day: "X", height: 30, words: 300 },
          { day: "J", height: 100, words: 1000 },
          { day: "V", height: 20, words: 200 },
          { day: "S", height: 4, words: 40 },
          { day: "D", height: 0, words: 0 },
        ],
        words: 1840,
      },
    });

    expect(screen.getByText("This week")).toBeTruthy();
    const metric = container.querySelector("[data-capture-metric]");
    expect(metric?.children).toHaveLength(2);
    expect(metric?.children[0]?.textContent).toBe("1840");
    expect(metric?.children[1]?.textContent).toBe("words captured");
    expect(container.querySelectorAll("[data-day]")).toHaveLength(7);
    expect(
      (container.querySelector('[data-day="J"] > span > span') as HTMLElement)
        .style.height,
    ).toBe("100%");
    expect(screen.queryByText("dictations")).toBeNull();
    expect(screen.queryByText("min spoken")).toBeNull();
  });
});
