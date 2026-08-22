// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import CaptureStatusCard, { type SignalStage } from "./CaptureStatusCard";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderStage = (stage: SignalStage) =>
  render(
    <I18nProvider i18n={i18n}>
      <CaptureStatusCard stage={stage} />
    </I18nProvider>,
  );

describe("CaptureStatusCard", () => {
  test("keeps the signal journey hidden while ready", () => {
    renderStage("ready");

    expect(screen.getByText("Dictation is ready")).toBeTruthy();
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

  test("keeps the ready state focused on the shortcut, not dashboard metrics", () => {
    renderStage("ready");

    expect(screen.getByText("Fn")).toBeTruthy();
    expect(screen.queryByText("dictations")).toBeNull();
    expect(screen.queryByText("words today")).toBeNull();
  });
});
