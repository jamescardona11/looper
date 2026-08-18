// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import CaptureStatusCard, { type SignalStage } from "./CaptureStatusCard";

vi.mock("../../../shared/ui/AnimatedCount", () => ({
  default: ({ value }: { value: number }) => <>{value}</>,
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const stats = {
  count: 12,
  words: 1840,
  audioSeconds: 1380,
  longestWords: 320,
  longestAudioSeconds: 240,
  llmCleanedCount: 4,
};

afterEach(cleanup);

const renderStage = (stage: SignalStage) =>
  render(
    <I18nProvider i18n={i18n}>
      <CaptureStatusCard stats={stats} stage={stage} />
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

  test("keeps today's numeric context in the ink surface", () => {
    renderStage("ready");

    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("1840")).toBeTruthy();
    expect(screen.getByText("23")).toBeTruthy();
  });
});
