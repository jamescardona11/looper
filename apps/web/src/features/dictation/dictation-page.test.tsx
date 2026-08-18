import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  dictionaryAdd: vi.fn(),
  dictionaryRemove: vi.fn(),
  replacementAdd: vi.fn(),
  replacementRemove: vi.fn(),
  snippetAdd: vi.fn(),
  snippetRemove: vi.fn(),
  settingsUpdate: vi.fn(),
  dictionaryEntries: [{ id: "dict_1", term: "Atlas", createdAt: Date.UTC(2025, 0, 1) }],
  replacementRules: [
    {
      id: "replacement_1",
      source: "brb",
      destination: "be right back",
      createdAt: Date.UTC(2025, 0, 2),
    },
  ],
  snippets: [
    {
      id: "snippet_1",
      trigger: "sig",
      expansion: "Best, Jane",
      createdAt: Date.UTC(2025, 0, 4),
    },
  ],
  settingsDoc: {
    id: "settings_1",
    version: 3,
    updatedAt: Date.UTC(2025, 0, 3),
    data: {
      styles: {
        selectedToneId: "style_1",
        customTones: [
          {
            id: "style_1",
            name: "Brief",
            promptTemplate: "Rewrite in one concise paragraph.",
          },
        ],
      },
      mode_rules: [
        {
          id: "mode_1",
          enabled: true,
          trigger: { type: "bundle_id", bundle_id: "com.apple.Safari" },
          transform_preset: "email",
          auto_send_on_insert: true,
        },
      ],
    },
  },
}));

vi.mock("@looper/data", () => ({
  useAuth: () => ({ isAuthenticated: mocks.isAuthenticated }),
  useDictationDictionary: () => ({
    entries: mocks.dictionaryEntries,
    isLoading: false,
    add: mocks.dictionaryAdd,
    remove: mocks.dictionaryRemove,
  }),
  useDictationReplacements: () => ({
    rules: mocks.replacementRules,
    isLoading: false,
    add: mocks.replacementAdd,
    remove: mocks.replacementRemove,
  }),
  useDictationSnippets: () => ({
    snippets: mocks.snippets,
    isLoading: false,
    add: mocks.snippetAdd,
    remove: mocks.snippetRemove,
  }),
  useDictationSettings: () => ({
    doc: mocks.settingsDoc,
    isLoading: false,
    update: mocks.settingsUpdate,
  }),
}));

vi.mock("@/shared/components/voice-tool-nav", () => ({
  VoiceToolNav: () => null,
}));

import { DictationPage } from "./dictation-page";

beforeEach(() => {
  mocks.isAuthenticated = true;
  mocks.dictionaryAdd.mockReset();
  mocks.dictionaryRemove.mockReset();
  mocks.replacementAdd.mockReset();
  mocks.replacementRemove.mockReset();
  mocks.snippetAdd.mockReset();
  mocks.snippetRemove.mockReset();
  mocks.settingsUpdate.mockReset();
  mocks.dictionaryAdd.mockResolvedValue("dict_2");
  mocks.dictionaryRemove.mockResolvedValue(undefined);
  mocks.replacementAdd.mockResolvedValue("replacement_2");
  mocks.replacementRemove.mockResolvedValue(undefined);
  mocks.snippetAdd.mockResolvedValue("snippet_2");
  mocks.snippetRemove.mockResolvedValue(undefined);
  mocks.settingsUpdate.mockResolvedValue("settings_1");
});

afterEach(cleanup);

function renderPage() {
  render(
    <I18nProvider defaultLocale="en">
      <DictationPage />
    </I18nProvider>,
  );
}

describe("DictationPage", () => {
  it("keeps mutations disabled until authentication is ready", () => {
    mocks.isAuthenticated = false;
    renderPage();

    expect(screen.getByLabelText("Term")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add term" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Remove term: Atlas/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add replacement" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add snippet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add style" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add rule" })).toBeDisabled();
  });

  it("renders dictionary, replacements, snippets, styles and Smart Modes from shared data hooks", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Dictation" })).toBeVisible();
    expect(screen.getByText("Atlas")).toBeVisible();
    expect(screen.getByText("brb")).toBeVisible();
    expect(screen.getByText("be right back")).toBeVisible();
    expect(screen.getByText("sig")).toBeVisible();
    expect(screen.getByText("Best, Jane")).toBeVisible();
    expect(screen.getByText("Brief")).toBeVisible();
    expect(screen.getByText("Smart Modes")).toBeVisible();
    expect(screen.getByText("com.apple.Safari")).toBeVisible();
    expect(screen.getByText(/Bundle ID · Email · Auto-send/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Selected" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("adds and removes dictionary terms", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "J11" } });
    fireEvent.click(screen.getByRole("button", { name: "Add term" }));

    await waitFor(() => {
      expect(mocks.dictionaryAdd).toHaveBeenCalledWith("J11");
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove term: Atlas/ }));

    await waitFor(() => {
      expect(mocks.dictionaryRemove).toHaveBeenCalledWith("dict_1");
    });
  });

  it("adds replacement rules", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Source phrase"), { target: { value: "asap" } });
    fireEvent.change(screen.getByLabelText("Replacement"), {
      target: { value: "as soon as possible" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add replacement" }));

    await waitFor(() => {
      expect(mocks.replacementAdd).toHaveBeenCalledWith("asap", "as soon as possible");
    });
  });

  it("adds and removes snippets", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Snippet trigger"), {
      target: { value: "addr" },
    });
    fireEvent.change(screen.getByLabelText("Snippet expansion"), {
      target: { value: "123 Main St" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add snippet" }));

    await waitFor(() => {
      expect(mocks.snippetAdd).toHaveBeenCalledWith("addr", "123 Main St");
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove snippet: sig/ }));

    await waitFor(() => {
      expect(mocks.snippetRemove).toHaveBeenCalledWith("snippet_1");
    });
  });

  it("updates styles through the dictation settings document", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000002",
    );
    renderPage();

    fireEvent.change(screen.getByLabelText("Style name"), { target: { value: "Friendly" } });
    fireEvent.change(screen.getByLabelText("Style prompt"), {
      target: { value: "Rewrite with a warmer tone." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add style" }));

    await waitFor(() => {
      expect(mocks.settingsUpdate).toHaveBeenCalledWith({
        styles: {
          selectedToneId: "style_1",
          customTones: [
            {
              id: "style_1",
              name: "Brief",
              promptTemplate: "Rewrite in one concise paragraph.",
            },
            {
              id: "00000000-0000-4000-8000-000000000002",
              name: "Friendly",
              promptTemplate: "Rewrite with a warmer tone.",
            },
          ],
        },
        mode_rules: [
          {
            id: "mode_1",
            enabled: true,
            trigger: { type: "bundle_id", bundle_id: "com.apple.Safari" },
            transform_preset: "email",
            auto_send_on_insert: true,
          },
        ],
      });
    });
  });

  it("adds and removes Smart Mode rules through the dictation settings document", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000003",
    );
    renderPage();

    fireEvent.change(screen.getByLabelText("Smart Mode trigger"), {
      target: { value: "github.com" },
    });
    fireEvent.click(screen.getByLabelText("Auto-send"));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    await waitFor(() => {
      expect(mocks.settingsUpdate).toHaveBeenCalledWith({
        styles: {
          selectedToneId: "style_1",
          customTones: [
            {
              id: "style_1",
              name: "Brief",
              promptTemplate: "Rewrite in one concise paragraph.",
            },
          ],
        },
        mode_rules: [
          {
            id: "mode_1",
            enabled: true,
            trigger: { type: "bundle_id", bundle_id: "com.apple.Safari" },
            transform_preset: "email",
            auto_send_on_insert: true,
          },
          {
            id: "00000000-0000-4000-8000-000000000003",
            enabled: true,
            trigger: { type: "bundle_id", bundle_id: "github.com" },
            transform_preset: "polish",
            auto_send_on_insert: true,
          },
        ],
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove Smart Mode: com.apple.Safari/ }));

    await waitFor(() => {
      expect(mocks.settingsUpdate).toHaveBeenLastCalledWith({
        styles: {
          selectedToneId: "style_1",
          customTones: [
            {
              id: "style_1",
              name: "Brief",
              promptTemplate: "Rewrite in one concise paragraph.",
            },
          ],
        },
        mode_rules: [],
      });
    });
  });
});
