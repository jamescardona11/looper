// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import VoiceView from "../VoiceView";

// Los hijos ya se prueban por su cuenta: aquí solo importa qué monta cada paso
// y con qué sección, que es el contrato de la reorganización.
vi.mock("../../../dictionary/components/DictionaryView", () => ({
  default: ({ section }: { section?: string }) => (
    <div data-testid="dictionary" data-section={section}>
      <input data-studio-focus="word" aria-label="Dictionary field" />
      <input data-studio-focus="block" aria-label="Building block field" />
    </div>
  ),
}));

vi.mock("../../../personalization/components/PersonalizationView", () => ({
  default: ({
    showModeRules,
    studio,
  }: {
    showModeRules?: boolean;
    studio?: boolean;
  }) => (
    <div
      data-testid="styles"
      data-mode-rules={String(showModeRules)}
      data-studio={String(studio)}
    />
  ),
}));

vi.mock("../../../personalization/components/ModeRulesSection", () => ({
  default: () => <div data-testid="automations" />,
}));

vi.mock("../../../personalization/queries", () => ({
  useInstalledApps: () => ({ data: [] }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "voice.title": "Voice",
    "voice.description": "Everything you teach Looper.",
    "voice.step.vocabulary": "Words",
    "voice.step.styles": "Writing",
    "voice.step.building_blocks": "Building blocks",
    "voice.step.rules": "Rules",
    "voice.step.snippets": "Snippets",
    "voice.step.automations": "Flows",
  },
});

afterEach(cleanup);

const renderVoice = () =>
  render(
    <I18nProvider i18n={i18n}>
      <VoiceView />
    </I18nProvider>,
  );

const step = (name: string) => screen.getByRole("tab", { name });

describe("VoiceView", () => {
  test("opens on Words so the first thing shown is what Looper mishears", () => {
    renderVoice();

    expect(screen.getByTestId("dictionary").dataset.section).toBe("words");
  });

  test("uses the workspace gutter once and keeps the Studio pane at 790px", () => {
    renderVoice();

    const workspace = screen.getByRole("heading", { level: 1 }).parentElement
      ?.parentElement;
    const panel = screen.getByRole("tabpanel");

    expect(workspace?.className).toContain("max-w-5xl");
    expect(workspace?.className).not.toContain("mx-auto");
    expect(workspace?.className).not.toContain("pt-8");
    expect(panel.className).toContain("max-w-[790px]");
  });

  test("keeps the canonical Studio header compact", () => {
    renderVoice();

    const tabs = screen.getByRole("tablist");
    expect(screen.queryByText("Everything you teach Looper.")).toBeNull();
    expect(tabs.className).toContain("mt-[22px]");
    expect(tabs.className).toContain("gap-[3px]");
    expect(step("Words").className).toContain("px-[13px]");
  });

  test("uses the dark signal surface for the active Studio tab", () => {
    renderVoice();

    const words = step("Words");
    expect(words.className).toContain("bg-[var(--color-text-primary)]");
    expect(words.className).not.toContain("bg-[var(--color-accent)]");
  });

  test("each step mounts its own surface", () => {
    renderVoice();

    fireEvent.click(step("Building blocks"));
    expect(screen.getByTestId("dictionary").dataset.section).toBe(
      "building-blocks",
    );

    fireEvent.click(step("Writing"));
    expect(screen.getByTestId("styles")).toBeTruthy();
    expect(screen.queryByTestId("dictionary")).toBeNull();

    fireEvent.click(step("Flows"));
    expect(screen.getByTestId("automations")).toBeTruthy();
    expect(screen.queryByTestId("styles")).toBeNull();
  });

  test("Smart Modes stay out of Writing — they are their own step", () => {
    renderVoice();

    fireEvent.click(step("Writing"));
    expect(screen.getByTestId("styles").dataset.modeRules).toBe("false");
    expect(screen.getByTestId("styles").dataset.studio).toBe("true");
  });

  test("the step list announces itself as tabs with one selected", () => {
    renderVoice();

    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(step("Words").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(step("Building blocks"));
    expect(step("Building blocks").getAttribute("aria-selected")).toBe("true");
    expect(step("Words").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      "voice-tab-building-blocks",
    );
  });

  test("keeps Rules and Snippets together in the Building blocks surface", () => {
    renderVoice();

    fireEvent.click(step("Building blocks"));
    expect(screen.getByTestId("dictionary").dataset.section).toBe(
      "building-blocks",
    );
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  test("Words exposes a real Add word action that focuses its editor", () => {
    renderVoice();

    fireEvent.click(screen.getByRole("button", { name: "Add word" }));

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Dictionary field" }),
    );
  });

  test("Building blocks focuses its real rule editor", () => {
    renderVoice();

    fireEvent.click(step("Building blocks"));
    fireEvent.click(screen.getByRole("button", { name: "New block" }));

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Building block field" }),
    );
  });

  test("moves and activates tabs with left and right arrows", () => {
    renderVoice();
    const words = step("Words");
    words.focus();

    fireEvent.keyDown(words, { key: "ArrowRight" });
    expect(step("Writing").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(step("Writing"));

    fireEvent.keyDown(step("Writing"), { key: "ArrowLeft" });
    expect(step("Words").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(words);
  });

  test("the four sections are ordered from recognition to reusable flows", () => {
    renderVoice();

    const labels = ["Words", "Writing", "Building blocks", "Flows"];
    const positions = labels.map((label) =>
      screen
        .getAllByRole("tab")
        .findIndex((node) => node.textContent?.includes(label)),
    );

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((index) => index >= 0)).toBe(true);
  });
});
