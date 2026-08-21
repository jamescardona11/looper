// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import DictionaryView from "../DictionaryView";

const mocks = vi.hoisted(() => ({
  settingsQuery: vi.fn(),
  modelsQuery: vi.fn(),
  replacementsQuery: vi.fn(),
  snippetsQuery: vi.fn(),
  suggestionsQuery: vi.fn(),
  usageQuery: vi.fn(),
  shiftHeld: false,
  persistEntries: vi.fn(async (value: string[]) => value),
  persistReplacements: vi.fn(async (value: unknown[]) => value),
  persistSnippets: vi.fn(async (value: unknown[]) => value),
  acceptSuggestion: vi.fn(),
  dismissSuggestion: vi.fn(),
  cacheEntries: vi.fn(),
  cacheReplacements: vi.fn(),
  cacheSnippets: vi.fn(),
  cacheSuggestions: vi.fn(),
}));

vi.mock("../../../settings/queries", () => ({
  settingsKeys: { detail: () => ["settings", "detail"] },
  useSettings: (...args: unknown[]) => mocks.settingsQuery(...args),
}));
vi.mock("../../../settings/models-queries", () => ({
  useModelCatalog: (...args: unknown[]) => mocks.modelsQuery(...args),
}));
vi.mock("../../queries", () => ({
  useReplacements: (...args: unknown[]) => mocks.replacementsQuery(...args),
  useSnippets: (...args: unknown[]) => mocks.snippetsQuery(...args),
  useSuggestedCorrections: (...args: unknown[]) =>
    mocks.suggestionsQuery(...args),
  useDictionaryUsage: (...args: unknown[]) => mocks.usageQuery(...args),
  setDictionaryEntriesCache: (...args: unknown[]) =>
    mocks.cacheEntries(...args),
  setDictionaryReplacementsCache: (...args: unknown[]) =>
    mocks.cacheReplacements(...args),
  setDictionarySnippetsCache: (...args: unknown[]) =>
    mocks.cacheSnippets(...args),
  setSuggestedCorrectionsCache: (...args: unknown[]) =>
    mocks.cacheSuggestions(...args),
}));
vi.mock("../../../../data/dictionary-sync", () => ({
  setLocalDictionary: (value: string[]) => mocks.persistEntries(value),
  setLocalReplacements: (value: unknown[]) => mocks.persistReplacements(value),
}));
vi.mock("../../../../data/snippets-sync", () => ({
  setLocalSnippets: (value: unknown[]) => mocks.persistSnippets(value),
}));
vi.mock("../../../../data/corrections", () => ({
  acceptSuggestedCorrection: (from: string, to: string) =>
    mocks.acceptSuggestion(from, to),
  dismissSuggestedCorrection: (from: string, to: string) =>
    mocks.dismissSuggestion(from, to),
}));
vi.mock("../../../../shared/hooks/useShiftHeld", () => ({
  useShiftHeld: () => mocks.shiftHeld,
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "contract",
  messages: {
    "dictionary.combined.title": "DICTIONARY-HEADER-UNIQUE",
    "dictionary.combined.description": "DICTIONARY-DESCRIPTION-UNIQUE",
    "dictionary.section.dictionary_title": "VOCABULARY-TITLE-UNIQUE",
    "dictionary.section.dictionary_description":
      "VOCABULARY-DESCRIPTION-UNIQUE",
    "dictionary.search_or_add_aria": "DICTIONARY-INPUT-UNIQUE",
    "dictionary.suggested_corrections.title": "SUGGESTIONS-TITLE-UNIQUE",
    "dictionary.suggested_corrections.accept_aria": "ACCEPT-{0}-UNIQUE",
    "dictionary.suggested_corrections.dismiss_aria": "DISMISS-{0}-UNIQUE",
    "dictionary.warning_aria": "MODEL-WARNING-UNIQUE",
    "dictionary.warning": "MODEL-{0}-UNSUPPORTED-UNIQUE",
  },
});

const idleQuery = (data: unknown) => ({
  data,
  error: null,
  isLoading: false,
});

function renderDictionary(element: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider i18n={i18n}>{element}</I18nProvider>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  mocks.settingsQuery.mockReturnValue(
    idleQuery({
      dictionary: ["Zulu", "alpha"],
      local_model: "basic-local",
      transcription_mode: "local",
    }),
  );
  mocks.modelsQuery.mockReturnValue(
    idleQuery([{ key: "basic-local", label: "Basic Local", capabilities: [] }]),
  );
  mocks.replacementsQuery.mockReturnValue(
    idleQuery([{ from: "teh", to: "the" }]),
  );
  mocks.snippetsQuery.mockReturnValue(
    idleQuery([{ trigger: "sig", expansion: "Best regards" }]),
  );
  mocks.suggestionsQuery.mockReturnValue(
    idleQuery([{ from: "adress", to: "address", count: 3 }]),
  );
  mocks.usageQuery.mockReturnValue(idleQuery({ alpha: 2 }));
  mocks.shiftHeld = false;
  mocks.acceptSuggestion.mockResolvedValue([]);
  mocks.dismissSuggestion.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DictionaryView contract", () => {
  test("keeps translated header, compatibility warning and alphabetical rows", () => {
    renderDictionary(<DictionaryView />);

    expect(screen.getByText("DICTIONARY-HEADER-UNIQUE")).toBeTruthy();
    expect(screen.getByText("VOCABULARY-TITLE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("VOCABULARY-DESCRIPTION-UNIQUE")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "MODEL-WARNING-UNIQUE" }),
    ).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("Basic Local");
    expect(screen.getByText("2 uses")).toBeTruthy();

    const alphaRow = screen.getByRole("button", { name: "alpha 2 uses" });
    const zuluRow = screen.getByRole("button", { name: "Zulu" });
    expect(
      alphaRow.compareDocumentPosition(zuluRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("Z")).toBeTruthy();
  });

  test("keeps add, search, edit, delete and Shift-delete behavior", async () => {
    const view = renderDictionary(<DictionaryView />);
    const input = screen.getByLabelText("DICTIONARY-INPUT-UNIQUE");

    fireEvent.change(input, { target: { value: "zu" } });
    expect(screen.getByRole("status").textContent).toContain("1 of 2 matches");
    expect(screen.queryByText("alpha", { exact: false })).toBeNull();
    fireEvent.change(input, { target: { value: " Beta " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(mocks.persistEntries).toHaveBeenCalledWith([
        "Beta",
        "Zulu",
        "alpha",
      ]),
    );

    view.unmount();
    renderDictionary(<DictionaryView />);
    fireEvent.click(screen.getByRole("button", { name: "alpha 2 uses" }));
    const editor = screen.getByDisplayValue("alpha");
    fireEvent.change(editor, { target: { value: "Alpha Prime" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    await waitFor(() =>
      expect(mocks.persistEntries).toHaveBeenCalledWith([
        "Zulu",
        "Alpha Prime",
      ]),
    );

    cleanup();
    renderDictionary(<DictionaryView />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Zulu" }));
    await waitFor(() =>
      expect(mocks.persistEntries).toHaveBeenCalledWith(["alpha"]),
    );

    cleanup();
    mocks.shiftHeld = true;
    renderDictionary(<DictionaryView embedded section="vocabulary" />);
    fireEvent.click(screen.getByRole("button", { name: "alpha" }));
    await waitFor(() =>
      expect(mocks.persistEntries).toHaveBeenCalledWith(["Zulu"]),
    );
  });

  test("routes focused sections and preserves replacement/snippet callbacks", async () => {
    const { container } = renderDictionary(
      <DictionaryView embedded section="rules" />,
    );

    expect(container.querySelector(".md\\:pr-6")?.className).toContain(
      "hidden",
    );
    expect(screen.getByLabelText("Find word to replace")).toBeTruthy();
    expect(
      screen.getByLabelText("Snippet trigger word").closest(".hidden"),
    ).toBeTruthy();
    const find = screen.getByLabelText("Find word to replace");
    const destination = screen.getByLabelText("Replace with");
    fireEvent.change(find, { target: { value: " adress " } });
    fireEvent.change(destination, { target: { value: " address " } });
    fireEvent.keyDown(destination, { key: "Enter" });
    await waitFor(() =>
      expect(mocks.persistReplacements).toHaveBeenCalledWith([
        { from: "adress", to: "address" },
        { from: "teh", to: "the" },
      ]),
    );

    cleanup();
    renderDictionary(<DictionaryView embedded section="snippets" />);
    expect(
      screen.getByLabelText("Find word to replace").closest(".hidden"),
    ).toBeTruthy();
    const trigger = screen.getByLabelText("Snippet trigger word");
    const expansion = screen.getByLabelText("Snippet expansion text");
    fireEvent.change(trigger, { target: { value: "thanks" } });
    fireEvent.change(expansion, { target: { value: "Thank you" } });
    fireEvent.keyDown(expansion, { key: "Enter" });
    await waitFor(() =>
      expect(mocks.persistSnippets).toHaveBeenCalledWith([
        { trigger: "thanks", expansion: "Thank you" },
        { trigger: "sig", expansion: "Best regards" },
      ]),
    );
  });

  test("accepts and dismisses corrections with the original cache refresh policy", async () => {
    const { queryClient } = renderDictionary(<DictionaryView />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(
      screen.getByRole("button", { name: "ACCEPT-address-UNIQUE" }),
    );
    await waitFor(() =>
      expect(mocks.acceptSuggestion).toHaveBeenCalledWith("adress", "address"),
    );
    expect(mocks.cacheSuggestions).toHaveBeenCalledWith(queryClient, []);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["settings", "detail"],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "DISMISS-address-UNIQUE" }),
    );
    await waitFor(() =>
      expect(mocks.dismissSuggestion).toHaveBeenCalledWith("adress", "address"),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  test("shows bootstrap and correction failures without hiding available data", async () => {
    mocks.replacementsQuery.mockReturnValue({
      ...idleQuery([{ from: "teh", to: "the" }]),
      error: new Error("BOOTSTRAP-FAILURE-UNIQUE"),
    });
    mocks.acceptSuggestion.mockRejectedValue(
      new Error("CORRECTION-FAILURE-UNIQUE"),
    );
    renderDictionary(<DictionaryView />);

    expect(screen.getByText("BOOTSTRAP-FAILURE-UNIQUE")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "ACCEPT-address-UNIQUE" }),
    );
    expect(await screen.findByText("CORRECTION-FAILURE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("Zulu")).toBeTruthy();
  });
});
