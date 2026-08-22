// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DictionaryReplacementsSection } from "../DictionaryReplacementsSection";
import { DictionarySnippetsSection } from "../DictionarySnippetsSection";

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "contract",
  messages: {
    "dictionary.section.replacements_title": "REPLACEMENTS-TITLE-UNIQUE",
    "dictionary.section.replacements_description":
      "REPLACEMENTS-DESCRIPTION-UNIQUE",
    "dictionary.replacements.find_aria": "FIND-ARIA-UNIQUE",
    "dictionary.replacements.replace_with_aria": "REPLACE-ARIA-UNIQUE",
    "dictionary.replacements.remove_value": "REMOVE-VALUE-UNIQUE",
    "dictionary.snippets.section_title": "SNIPPETS-TITLE-UNIQUE",
    "dictionary.snippets.section_description": "SNIPPETS-DESCRIPTION-UNIQUE",
    "dictionary.snippets.trigger_aria": "TRIGGER-ARIA-UNIQUE",
    "dictionary.snippets.expansion_aria": "EXPANSION-ARIA-UNIQUE",
    "dictionary.snippets.none": "NO-SNIPPETS-UNIQUE",
    "dictionary.snippets.none_description": "NO-SNIPPETS-DESCRIPTION-UNIQUE",
  },
});

const renderTranslated = (element: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{element}</I18nProvider>);

type ReplacementProps = ComponentProps<typeof DictionaryReplacementsSection>;
type SnippetProps = ComponentProps<typeof DictionarySnippetsSection>;

const replacementProps = (
  overrides: Partial<ReplacementProps> = {},
): ReplacementProps => ({
  visible: true,
  vocabularyVisible: true,
  embedded: false,
  newFrom: "",
  setNewFrom: vi.fn(),
  newTo: "",
  setNewTo: vi.fn(),
  handleAddReplacement: vi.fn(),
  replacementCountLabel: "2 replacements",
  replacementHintLabel: "Hold Shift to delete",
  replacementsPending: false,
  panelBodyClassName: "replacement-panel",
  replacements: [
    { from: "teh", to: "the" },
    { from: "filler", to: "" },
  ],
  fadeItemThreshold: 1,
  panelBodyFadeClassName: "fade-panel",
  loading: false,
  editingReplacementIndex: null,
  editRowClassName: "edit-row",
  editingFrom: "teh",
  setEditingFrom: vi.fn(),
  editingTo: "the",
  setEditingTo: vi.fn(),
  cancelReplacementEdit: vi.fn(),
  handleEditReplacementCommit: vi.fn(),
  itemRowClassName: "item-row",
  shiftHeld: false,
  handleDeleteReplacement: vi.fn(),
  startEditingReplacement: vi.fn(),
  actionGradientStyle: { background: "var(--color-bg-tertiary)" },
  deleteButtonActiveClassName: "delete-active",
  deleteButtonClassName: "delete-idle",
  ...overrides,
});

const snippetProps = (overrides: Partial<SnippetProps> = {}): SnippetProps => ({
  visible: true,
  section: "all",
  embedded: false,
  newTrigger: "",
  setNewTrigger: vi.fn(),
  newExpansion: "",
  setNewExpansion: vi.fn(),
  handleAddSnippet: vi.fn(),
  snippetCountLabel: "1 snippet",
  snippetHintLabel: "Hold Shift to delete",
  snippetsPending: false,
  snippets: [{ trigger: "sig", expansion: "Best regards" }],
  loading: false,
  fadeItemThreshold: 6,
  panelBodyFadeClassName: "fade-panel",
  editingSnippetIndex: null,
  editRowClassName: "edit-row",
  editingTrigger: "sig",
  setEditingTrigger: vi.fn(),
  editingExpansion: "Best regards",
  setEditingExpansion: vi.fn(),
  cancelSnippetEdit: vi.fn(),
  handleEditSnippetCommit: vi.fn(),
  itemRowClassName: "snippet-row",
  shiftHeld: false,
  handleDeleteSnippet: vi.fn(),
  startEditingSnippet: vi.fn(),
  actionGradientStyle: { background: "var(--color-bg-tertiary)" },
  deleteButtonActiveClassName: "delete-active",
  deleteButtonClassName: "delete-idle",
  ...overrides,
});

afterEach(cleanup);

describe("dictionary pair sections", () => {
  test("preserves replacement copy, layout, add, edit and delete actions", () => {
    const props = replacementProps();
    const { container } = renderTranslated(
      <DictionaryReplacementsSection {...props} />,
    );

    expect(container.firstElementChild?.className).toBe(
      "min-w-0 border-t border-border-primary pt-6 md:border-t-0 md:border-l md:pl-6 md:pt-0 lg:pl-8",
    );
    expect(screen.getByText("REPLACEMENTS-TITLE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("REPLACEMENTS-DESCRIPTION-UNIQUE")).toBeTruthy();
    expect(screen.getByText("REMOVE-VALUE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("2 replacements")).toBeTruthy();

    const findInput = screen.getByLabelText("FIND-ARIA-UNIQUE");
    const replaceInput = screen.getByLabelText("REPLACE-ARIA-UNIQUE");
    fireEvent.change(findInput, { target: { value: "adress" } });
    expect(props.setNewFrom).toHaveBeenCalledWith("adress");
    fireEvent.change(replaceInput, { target: { value: "address" } });
    expect(props.setNewTo).toHaveBeenCalledWith("address");
    fireEvent.keyDown(findInput, { key: "Enter" });
    fireEvent.keyDown(replaceInput, { key: "Enter" });
    expect(props.handleAddReplacement).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /teh.*the/ }));
    expect(props.startEditingReplacement).toHaveBeenCalledWith(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete replacement for teh" }),
    );
    expect(props.handleDeleteReplacement).toHaveBeenCalledWith(0);

    const list = container.querySelector("[aria-busy]");
    expect(list?.getAttribute("aria-busy")).toBe("false");
    expect(list?.className).toBe("replacement-panel fade-panel");
  });

  test("keeps Shift-click deletion and edit keyboard/blur behavior", () => {
    const deleteReplacement = vi.fn();
    const startEditing = vi.fn();
    const shifted = replacementProps({
      replacements: [{ from: "teh", to: "the" }],
      fadeItemThreshold: 6,
      shiftHeld: true,
      handleDeleteReplacement: deleteReplacement,
      startEditingReplacement: startEditing,
    });
    const shiftedView = renderTranslated(
      <DictionaryReplacementsSection {...shifted} />,
    );
    const rowButton = screen.getByRole("button", { name: /teh.*the/ });
    expect(rowButton.getAttribute("title")).toBe("Delete replacement for teh");
    fireEvent.click(rowButton);
    expect(deleteReplacement).toHaveBeenCalledWith(0);
    expect(startEditing).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Delete replacement for teh" })
        .className,
    ).toBe("delete-active");
    shiftedView.unmount();

    const cancel = vi.fn();
    const commit = vi.fn();
    const setFrom = vi.fn();
    const setTo = vi.fn();
    renderTranslated(
      <DictionaryReplacementsSection
        {...replacementProps({
          replacements: [{ from: "teh", to: "the" }],
          fadeItemThreshold: 6,
          editingReplacementIndex: 0,
          cancelReplacementEdit: cancel,
          handleEditReplacementCommit: commit,
          setEditingFrom: setFrom,
          setEditingTo: setTo,
        })}
      />,
    );
    const editor = document.querySelector("[data-replacement-edit]");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("Replacement editor was not rendered");
    }
    const [fromInput, toInput] = within(editor).getAllByRole("textbox");
    fireEvent.change(fromInput!, { target: { value: "their" } });
    fireEvent.change(toInput!, { target: { value: "there" } });
    expect(setFrom).toHaveBeenCalledWith("their");
    expect(setTo).toHaveBeenCalledWith("there");

    fireEvent.blur(fromInput!, { relatedTarget: toInput });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.blur(toInput!, { relatedTarget: null });
    expect(commit).toHaveBeenCalledOnce();
    fireEvent.keyDown(fromInput!, { key: "Escape" });
    expect(cancel).toHaveBeenCalledOnce();
    fireEvent.keyDown(toInput!, { key: "Enter" });
    expect(commit).toHaveBeenCalledTimes(2);
  });

  test("preserves snippet copy, section spacing and callbacks", () => {
    const props = snippetProps();
    const { container } = renderTranslated(
      <DictionarySnippetsSection {...props} />,
    );

    expect(container.firstElementChild?.className).toBe(
      "min-w-0 mt-6 border-t border-border-primary pt-6",
    );
    expect(screen.getByText("SNIPPETS-TITLE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("SNIPPETS-DESCRIPTION-UNIQUE")).toBeTruthy();
    const trigger = screen.getByLabelText("TRIGGER-ARIA-UNIQUE");
    const expansion = screen.getByLabelText("EXPANSION-ARIA-UNIQUE");
    fireEvent.change(trigger, { target: { value: "thanks" } });
    fireEvent.change(expansion, { target: { value: "Thank you" } });
    expect(props.setNewTrigger).toHaveBeenCalledWith("thanks");
    expect(props.setNewExpansion).toHaveBeenCalledWith("Thank you");
    fireEvent.keyDown(expansion, { key: "Enter" });
    expect(props.handleAddSnippet).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /sig.*Best regards/ }));
    expect(props.startEditingSnippet).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete snippet sig" }));
    expect(props.handleDeleteSnippet).toHaveBeenCalledWith(0);
  });

  test("keeps translated snippet empty state and busy marker", () => {
    const { container } = renderTranslated(
      <DictionarySnippetsSection
        {...snippetProps({
          snippets: [],
          snippetsPending: true,
          embedded: true,
        })}
      />,
    );

    expect(screen.queryByText("SNIPPETS-TITLE-UNIQUE")).toBeNull();
    expect(screen.getByText("NO-SNIPPETS-UNIQUE")).toBeTruthy();
    expect(screen.getByText("NO-SNIPPETS-DESCRIPTION-UNIQUE")).toBeTruthy();
    expect(
      container.querySelector("[aria-busy]")?.getAttribute("aria-busy"),
    ).toBe("true");
  });
});
