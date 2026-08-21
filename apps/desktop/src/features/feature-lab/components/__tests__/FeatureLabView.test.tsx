// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import FeatureLabView from "../FeatureLabView";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("FeatureLabView", () => {
  test("opens the real feature destinations", () => {
    const actions = {
      dictionary: vi.fn(),
      library: vi.fn(),
      memory: vi.fn(),
      workflows: vi.fn(),
      appSettings: vi.fn(),
    };

    render(
      <I18nProvider i18n={i18n}>
        <FeatureLabView
          onOpenDictionary={actions.dictionary}
          onOpenLibrary={actions.library}
          onOpenMemory={actions.memory}
          onOpenWorkflows={actions.workflows}
          onOpenAppSettings={actions.appSettings}
          runDiagnostics={async () => []}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open workflows/i }));
    fireEvent.click(screen.getByRole("button", { name: /Open snippets/i }));
    fireEvent.click(screen.getByRole("button", { name: /Search Memory/i }));
    fireEvent.click(screen.getByRole("button", { name: /Open meetings/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Open privacy setting/i }),
    );

    expect(actions.workflows).toHaveBeenCalledTimes(1);
    expect(actions.dictionary).toHaveBeenCalledTimes(1);
    expect(actions.memory).toHaveBeenCalledTimes(1);
    expect(actions.library).toHaveBeenCalledTimes(1);
    expect(actions.appSettings).toHaveBeenCalledTimes(1);
  });

  test("shows runtime evidence without claiming manual checks passed", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <FeatureLabView
          onOpenDictionary={vi.fn()}
          onOpenLibrary={vi.fn()}
          onOpenMemory={vi.fn()}
          onOpenWorkflows={vi.fn()}
          onOpenAppSettings={vi.fn()}
          runDiagnostics={async () => [
            {
              id: "memory",
              label: "Memory backend",
              detail: "Backend responded with 2 local records.",
              status: "pass",
            },
            {
              id: "insertion",
              label: "Insertion",
              detail: "Use the field above with a real shortcut.",
              status: "manual",
            },
          ]}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run diagnostics" }));

    await waitFor(() => {
      expect(
        screen.getByText("Backend responded with 2 local records."),
      ).toBeTruthy();
    });
    expect(
      await screen.findByText(
        "Use the field above with a real shortcut.",
        {},
        {
          timeout: 2_000,
        },
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Dictation test field" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/\d{1,2}:\d{2}/).length).toBeGreaterThan(0);
  });
});
