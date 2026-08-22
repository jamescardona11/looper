// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import VoiceView from "./VoiceView";

// Los hijos ya se prueban por su cuenta: aquí solo importa qué monta cada paso
// y con qué sección, que es el contrato de la reorganización.
vi.mock("../../dictionary/components/DictionaryView", () => ({
  default: ({ section }: { section?: string }) => (
    <div data-testid="dictionary" data-section={section} />
  ),
}));

vi.mock("../../personalization/components/PersonalizationView", () => ({
  default: ({ showModeRules }: { showModeRules?: boolean }) => (
    <div data-testid="styles" data-mode-rules={String(showModeRules)} />
  ),
}));

vi.mock("../../personalization/components/ModeRulesSection", () => ({
  default: () => <div data-testid="automations" />,
}));

vi.mock("../../personalization/queries", () => ({
  useInstalledApps: () => ({ data: [] }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "voice.title": "Shape how Looper writes.",
    "voice.description": "Everything you teach Looper.",
    "voice.step.vocabulary": "Words",
    "voice.step.styles": "Writing",
    "voice.step.rules": "Corrections",
    "voice.step.snippets": "Building blocks",
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

    expect(screen.getByTestId("dictionary").dataset.section).toBe("vocabulary");
  });

  test("each step mounts its own surface", () => {
    renderVoice();

    fireEvent.click(step("Corrections"));
    expect(screen.getByTestId("dictionary").dataset.section).toBe("rules");

    fireEvent.click(step("Building blocks"));
    expect(screen.getByTestId("dictionary").dataset.section).toBe("snippets");

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
  });

  test("the step list announces itself as tabs with one selected", () => {
    renderVoice();

    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(step("Words").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(step("Corrections"));
    expect(step("Corrections").getAttribute("aria-selected")).toBe("true");
    expect(step("Words").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      "voice-tab-rules",
    );
  });

  // El indicador es puramente visual (aria-hidden), así que no lo cubre ninguna
  // asercion de rol: se comprueba que vive dentro del tab seleccionado.
  test("moves the active tab indicator into the selected tab", () => {
    renderVoice();
    const indicatorIn = (label: string) =>
      step(label).querySelector('[aria-hidden="true"]');

    expect(indicatorIn("Words")).not.toBeNull();
    expect(indicatorIn("Corrections")).toBeNull();

    fireEvent.click(step("Corrections"));

    expect(indicatorIn("Corrections")).not.toBeNull();
    expect(indicatorIn("Words")).toBeNull();
  });

  test("moves and activates tabs with left and right arrows", () => {
    renderVoice();
    const vocabulary = step("Words");
    vocabulary.focus();

    fireEvent.keyDown(vocabulary, { key: "ArrowRight" });
    expect(step("Writing").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(step("Writing"));

    fireEvent.keyDown(step("Writing"), { key: "ArrowLeft" });
    expect(step("Words").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(vocabulary);
  });

  test("the five Studio areas keep the actual writing controls distinct", () => {
    renderVoice();

    const labels = [
      "Words",
      "Writing",
      "Corrections",
      "Building blocks",
      "Flows",
    ];
    const positions = labels.map((label) =>
      screen
        .getAllByRole("tab")
        .findIndex((node) => node.textContent?.includes(label)),
    );

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((index) => index >= 0)).toBe(true);
  });
});
