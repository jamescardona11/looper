// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import InsightsView from "../InsightsView";

const mocks = vi.hoisted(() => ({ records: [] as unknown[] }));

vi.mock("../../queries", () => ({
  useTranscriptionList: () => ({ data: mocks.records }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(() => {
  cleanup();
  mocks.records = [];
});

describe("InsightsView", () => {
  test("presenta la jerarquía plana y factual de la referencia", () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <InsightsView transcriptionMode="local" />
      </I18nProvider>,
    );

    expect(screen.getByText("Proof, not a scoreboard.")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getByText("words this week")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(
      screen.getByText("Local transcription is selected for new dictations."),
    ).toBeTruthy();
    expect(screen.getByText("0:00")).toBeTruthy();
    expect(screen.getByText("Where your dictation lands.")).toBeTruthy();
    expect(
      screen.getByText(
        "Destination context appears after your first dictation this week.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Nothing was lost.")).toBeTruthy();
    expect(screen.getByText("Originals kept")).toBeTruthy();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe("w-full min-w-0");
    expect(screen.getByText("Insights").className).toContain("uppercase");
    expect(
      screen.getByText("words this week").closest("article")?.parentElement
        ?.className,
    ).toContain("min-[1081px]:grid-cols-3");
    expect(
      screen.getByText("Originals kept").parentElement?.className,
    ).toContain("grid-cols-[96px_minmax(0,1fr)_52px]");
  });

  test("deriva destinos y recuperación desde registros locales reales", () => {
    mocks.records = [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        text: "Plan the launch",
        audio_path: "/tmp/launch.m4a",
        speech_model: "local",
        audio_available: true,
        llm_cleaned: false,
        synced: false,
        word_count: 12,
        audio_duration_seconds: 6,
        status: "success",
        app_id: "com.openai.chat",
      },
      {
        id: "2",
        timestamp: new Date().toISOString(),
        text: "Fix the regression",
        audio_path: "/tmp/fix.m4a",
        speech_model: "local",
        audio_available: false,
        llm_cleaned: false,
        synced: false,
        word_count: 8,
        audio_duration_seconds: 4,
        status: "success",
        app_id: "com.microsoft.VSCode",
      },
      {
        id: "3",
        timestamp: new Date().toISOString(),
        text: "",
        audio_path: "",
        speech_model: "local",
        audio_available: false,
        llm_cleaned: false,
        synced: false,
        word_count: 0,
        audio_duration_seconds: 0,
        status: "error",
      },
    ];

    render(
      <I18nProvider i18n={i18n}>
        <InsightsView transcriptionMode="local" />
      </I18nProvider>,
    );

    expect(screen.getByText("AI prompts")).toBeTruthy();
    expect(screen.getByText("Code & terminals")).toBeTruthy();
    expect(
      screen.getByText("Most dictations landed in AI prompts this week."),
    ).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(
      screen.getByText("All weekly dictations used the local speech model."),
    ).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
  });

  test("describe cloud processing without claiming on-device privacy", () => {
    mocks.records = [
      {
        id: "remote-1",
        timestamp: new Date().toISOString(),
        text: "Remote transcript",
        audio_path: "/tmp/remote.m4a",
        speech_model: "remote:openai:gpt-4o-mini-transcribe",
        audio_available: true,
        llm_cleaned: false,
        synced: false,
        word_count: 2,
        audio_duration_seconds: 3,
        status: "success",
        app_id: "com.openai.chat",
      },
    ];

    render(
      <I18nProvider i18n={i18n}>
        <InsightsView transcriptionMode="cloud" />
      </I18nProvider>,
    );

    expect(screen.getByText("0%")).toBeTruthy();
    expect(
      screen.getByText(
        "All weekly dictations used a configured remote speech provider.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("All weekly dictations used the local speech model."),
    ).toBeNull();
  });
});
