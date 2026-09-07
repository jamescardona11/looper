// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PersonalizationView from "../PersonalizationView";
import type { Personality } from "../../../../contracts";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  preview: vi.fn(),
  personalities: vi.fn(),
  queryData: vi.fn(),
  save: vi.fn(),
  setCache: vi.fn(),
  cleanupEnabled: false,
}));

vi.mock("../../../../data/personalization", () => ({
  previewPersonalityStyle: (...args: unknown[]) => mocks.preview(...args),
  setPersonalities: (...args: unknown[]) => mocks.save(...args),
  getPersonalities: vi.fn(),
  listInstalledApps: vi.fn(),
  listWebsiteIcons: vi.fn(),
  getModeRules: vi.fn(),
  setModeRules: vi.fn(),
}));

vi.mock("../../queries", () => ({
  personalizationKeys: {
    installedApps: () => ["installed-apps"],
    personalities: () => ["personalities"],
    websiteIcons: () => ["website-icons"],
  },
  setPersonalitiesCache: (...args: unknown[]) => mocks.setCache(...args),
  useInstalledApps: () => ({ data: [], isLoading: false, error: null }),
  usePersonalities: () => mocks.personalities(),
  useWebsiteIconMap: () => ({ data: {}, error: null }),
}));

vi.mock("../../../../shared/hooks/useShiftHeld", () => ({
  useShiftHeld: () => false,
}));

vi.mock("../../../settings/preferences/queries", () => ({
  useSettings: (select: (settings: unknown) => unknown) => ({
    data: select({
      cleanup_enabled: false,
      smart_shortcut: "Fn",
      shortcut_bindings: {
        smart: [
          {
            shortcut: "Fn",
            temporary: false,
            cleanup_enabled: mocks.cleanupEnabled,
          },
        ],
        hold: [],
        toggle: [],
      },
    }),
    error: null,
    isLoading: false,
  }),
}));

vi.mock("../ModeRulesSection", () => ({ default: () => null }));
vi.mock("../PersonalityModal", () => ({
  default: ({ onDelete }: { onDelete: () => void }) => (
    <div data-testid="personality-editor">
      <button type="button" onClick={onDelete}>
        delete from editor
      </button>
    </div>
  ),
  AppIconBadge: () => null,
  WebsiteFavicon: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: (...args: unknown[]) => mocks.queryData(...args),
    invalidateQueries: (...args: unknown[]) => mocks.invalidateQueries(...args),
  }),
}));

const style = (id: string, name: string, enabled = true): Personality =>
  ({
    id,
    name,
    enabled,
    apps: [],
    websites: [],
    instructions: [`How ${name} reads`],
  }) as Personality;

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const renderView = (translation = i18n) =>
  render(
    <I18nProvider i18n={translation}>
      <PersonalizationView embedded showModeRules={false} />
    </I18nProvider>,
  );

const renderWorkspace = (translation = i18n) =>
  render(
    <I18nProvider i18n={translation}>
      <PersonalizationView showModeRules={false} />
    </I18nProvider>,
  );

const renderStudio = (translation = i18n) =>
  render(
    <I18nProvider i18n={translation}>
      <PersonalizationView embedded showModeRules={false} studio />
    </I18nProvider>,
  );

beforeEach(() => {
  mocks.queryData.mockReturnValue(undefined);
  mocks.save.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.invalidateQueries.mockReset();
  mocks.preview.mockReset();
  mocks.personalities.mockReset();
  mocks.queryData.mockReset();
  mocks.save.mockReset();
  mocks.setCache.mockReset();
  mocks.cleanupEnabled = false;
});

describe("PersonalizationView", () => {
  test("selects the first style so the detail is never empty on arrival", () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging"), style("p2", "Email")],
      isLoading: false,
      error: null,
    });

    renderView();

    expect(screen.getByRole("heading", { name: "Messaging" })).toBeTruthy();
    expect(screen.getByText("How Messaging reads")).toBeTruthy();
  });

  test("picking another style swaps the detail", () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging"), style("p2", "Email")],
      isLoading: false,
      error: null,
    });

    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Email/ }));

    expect(screen.getByRole("heading", { name: "Email" })).toBeTruthy();
  });

  test("the preview sends the edited sample through the real pipeline", async () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging")],
      isLoading: false,
      error: null,
    });
    mocks.preview.mockResolvedValue("Can you move the meeting to Friday?");

    renderView();

    const sample = screen.getByPlaceholderText(/Type or paste/);
    fireEvent.change(sample, { target: { value: "move the meeting friday" } });
    fireEvent.click(screen.getByRole("button", { name: "See it written" }));

    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith(
        "p1",
        "move the meeting friday",
      ),
    );
    expect(
      await screen.findByText("Can you move the meeting to Friday?"),
    ).toBeTruthy();
  });

  test("Studio Writing derives cleanup and previews from saved configuration", () => {
    mocks.cleanupEnabled = true;
    mocks.personalities.mockReturnValue({
      data: [style("coding", "Coding")],
      isLoading: false,
      error: null,
    });

    renderStudio();

    expect(
      screen.getByRole("heading", { name: "Writing for the work at hand" }),
    ).toBeTruthy();
    expect(screen.getByText("Cleanup level")).toBeTruthy();
    expect(
      screen
        .getByText("Clean up")
        .closest("[data-active]")
        ?.getAttribute("data-active"),
    ).toBe("true");
    expect(screen.getByRole("heading", { name: "Coding" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Type or paste/)).toBeTruthy();
  });

  test("Studio New mode uses the existing persisted mode action", () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging")],
      isLoading: false,
      error: null,
    });

    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "New mode" }));

    expect(mocks.setCache).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ name: "New Mode" })]),
    );
  });

  test("a failed preview shows the reason instead of a stale result", async () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging")],
      isLoading: false,
      error: null,
    });
    mocks.preview.mockRejectedValue(new Error("Set up AI writing first"));

    renderView();

    fireEvent.change(screen.getByPlaceholderText(/Type or paste/), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "See it written" }));

    expect(await screen.findByText("Set up AI writing first")).toBeTruthy();
  });

  test("keeps the public Lingui ids wired to their own copy", () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging")],
      isLoading: false,
      error: null,
    });
    const distinctive = setupI18n();
    distinctive.loadAndActivate({
      locale: "distinct",
      messages: {
        "personalization.shared_list_description": "DISTINCT DESTINATIONS",
        "personalization.add_style_inline": "DISTINCT CREATE STYLE",
        "personalization.try_style": "DISTINCT TRY STYLE",
      },
    });

    renderView(distinctive);

    expect(screen.getByText("DISTINCT DESTINATIONS")).toBeTruthy();
    expect(screen.getByText("DISTINCT CREATE STYLE")).toBeTruthy();
    expect(screen.getByText("DISTINCT TRY STYLE")).toBeTruthy();
  });

  test("writes a toggle optimistically and persists it after the debounce", async () => {
    vi.useFakeTimers();
    const initial = [style("p1", "Messaging")];
    mocks.personalities.mockReturnValue({
      data: initial,
      isLoading: false,
      error: null,
    });
    mocks.queryData.mockReturnValue(initial);

    renderView();
    fireEvent.click(
      screen.getByRole("switch", { name: "Messaging style enabled" }),
    );

    const disabled = [{ ...initial[0], enabled: false }];
    expect(mocks.setCache).toHaveBeenCalledWith(expect.anything(), disabled);
    expect(mocks.save).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.save).toHaveBeenCalledWith(disabled);
  });

  test("flushes a pending optimistic change when the view unmounts", () => {
    vi.useFakeTimers();
    const initial = [style("p1", "Messaging")];
    mocks.personalities.mockReturnValue({
      data: initial,
      isLoading: false,
      error: null,
    });
    mocks.queryData.mockReturnValue(initial);

    const view = renderView();
    fireEvent.click(
      screen.getByRole("switch", { name: "Messaging style enabled" }),
    );
    view.unmount();

    expect(mocks.save).toHaveBeenCalledWith([
      { ...initial[0], enabled: false },
    ]);
  });

  test("Escape closes the active editor without mutating the style", () => {
    mocks.personalities.mockReturnValue({
      data: [style("p1", "Messaging")],
      isLoading: false,
      error: null,
    });

    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("personality-editor")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("personality-editor")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  test("keeps the workspace detail and confirmed-delete flow connected", () => {
    const initial = [style("p1", "Messaging")];
    mocks.personalities.mockReturnValue({
      data: initial,
      isLoading: false,
      error: null,
    });
    mocks.queryData.mockReturnValue(initial);
    const distinctive = setupI18n();
    distinctive.loadAndActivate({
      locale: "workspace-contract",
      messages: {
        "personalization.edit_style": "DISTINCT EDIT STYLE",
        "personalization.delete_mode.title": "DISTINCT DELETE TITLE",
        "personalization.delete_mode.description":
          "DISTINCT DELETE DESCRIPTION",
        "personalization.cancel": "DISTINCT CANCEL",
        "personalization.delete": "DISTINCT CONFIRM DELETE",
      },
    });

    const firstRender = renderWorkspace(distinctive);

    const detail = screen
      .getByRole("heading", { name: "Messaging" })
      .closest("section");
    expect(detail?.className).toBe(
      "flex min-w-0 flex-1 flex-col rounded-xl border border-border-primary bg-surface-surface p-5 shadow-sm",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "DISTINCT EDIT STYLE" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "delete from editor" }));
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("DISTINCT DELETE TITLE")).toBeTruthy();
    expect(screen.getByText("DISTINCT DELETE DESCRIPTION")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "DISTINCT CANCEL" }));
    expect((screen.getByRole("dialog") as HTMLElement).style.opacity).toBe("0");
    expect(mocks.setCache).not.toHaveBeenCalled();

    firstRender.unmount();
    renderWorkspace(distinctive);
    fireEvent.click(
      screen.getByRole("button", { name: "DISTINCT EDIT STYLE" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "delete from editor" }));
    fireEvent.click(
      screen.getByRole("button", { name: "DISTINCT CONFIRM DELETE" }),
    );
    expect(mocks.setCache).toHaveBeenCalledWith(expect.anything(), []);
  });
});
