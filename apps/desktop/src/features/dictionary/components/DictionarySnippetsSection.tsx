import { useLingui } from "@lingui/react/macro";
import type { CSSProperties } from "react";

import type { UserSnippet } from "../../../contracts";
import { DictionaryPairForm } from "./dictionary-pair-form";
import { DictionaryPairList } from "./dictionary-pair-list";

type DictionarySnippetsSectionProps = {
  visible: boolean;
  section: "all" | "vocabulary" | "rules" | "snippets";
  embedded: boolean;
  newTrigger: string;
  setNewTrigger: (value: string) => void;
  newExpansion: string;
  setNewExpansion: (value: string) => void;
  handleAddSnippet: () => void;
  snippetCountLabel: string;
  snippetHintLabel: string;
  snippetsPending: boolean;
  snippets: UserSnippet[];
  loading: boolean;
  fadeItemThreshold: number;
  panelBodyFadeClassName: string;
  editingSnippetIndex: number | null;
  editRowClassName: string;
  editingTrigger: string;
  setEditingTrigger: (value: string) => void;
  editingExpansion: string;
  setEditingExpansion: (value: string) => void;
  cancelSnippetEdit: () => void;
  handleEditSnippetCommit: () => void;
  itemRowClassName: string;
  shiftHeld: boolean;
  handleDeleteSnippet: (index: number) => void;
  startEditingSnippet: (index: number) => void;
  actionGradientStyle: CSSProperties;
  deleteButtonActiveClassName: string;
  deleteButtonClassName: string;
};

const FORM_GRID =
  "mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)] sm:items-end";
const LIST_BODY =
  "mt-4 max-h-[calc(100vh-330px)] overflow-x-hidden overflow-y-auto custom-scrollbar";

export function DictionarySnippetsSection(
  props: DictionarySnippetsSectionProps,
) {
  const { t } = useLingui();
  const rows = props.snippets.map((snippet, index) => ({
    key: `${snippet.trigger}-${index}`,
    primary: snippet.trigger,
    secondary: snippet.expansion,
    deleteLabel: t({
      id: "dictionary.snippets.delete",
      message: `Delete snippet ${snippet.trigger}`,
    }),
  }));
  return (
    <div
      className={`min-w-0 ${
        props.visible
          ? props.section === "all"
            ? "mt-6 border-t border-border-primary pt-6"
            : ""
          : "hidden"
      }`}
    >
      <DictionaryPairForm
        title={
          props.embedded
            ? null
            : t({
                id: "dictionary.snippets.section_title",
                message: "Snippets",
              })
        }
        description={t({
          id: "dictionary.snippets.section_description",
          message: "Dictate a trigger word to insert its full snippet text.",
        })}
        gridClassName={FORM_GRID}
        primary={{
          value: props.newTrigger,
          onChange: props.setNewTrigger,
          placeholder: t({
            id: "dictionary.snippets.trigger",
            message: "Trigger word...",
          }),
          ariaLabel: t({
            id: "dictionary.snippets.trigger_aria",
            message: "Snippet trigger word",
          }),
        }}
        secondary={{
          value: props.newExpansion,
          onChange: props.setNewExpansion,
          placeholder: t({
            id: "dictionary.snippets.expansion",
            message: "Expands to...",
          }),
          ariaLabel: t({
            id: "dictionary.snippets.expansion_aria",
            message: "Snippet expansion text",
          }),
        }}
        onSubmit={props.handleAddSnippet}
        countLabel={props.snippetCountLabel}
        hintLabel={props.snippetHintLabel}
      />
      <DictionaryPairList
        pending={props.snippetsPending}
        bodyClassName={LIST_BODY}
        rows={rows}
        fadeItemThreshold={props.fadeItemThreshold}
        panelBodyFadeClassName={props.panelBodyFadeClassName}
        loading={props.loading}
        emptyTitle={t({
          id: "dictionary.snippets.none",
          message: "No snippets yet",
        })}
        emptyDescription={t({
          id: "dictionary.snippets.none_description",
          message:
            "Add a trigger word and its expansion above, then press Enter to save it here.",
        })}
        editing={{
          index: props.editingSnippetIndex,
          rowClassName: props.editRowClassName,
          marker: "data-snippet-edit",
          primary: props.editingTrigger,
          onPrimaryChange: props.setEditingTrigger,
          secondary: props.editingExpansion,
          onSecondaryChange: props.setEditingExpansion,
          secondaryPlaceholder: t({
            id: "dictionary.snippets.expansion",
            message: "Expands to...",
          }),
          onCancel: props.cancelSnippetEdit,
          onCommit: props.handleEditSnippetCommit,
        }}
        actions={{
          itemRowClassName: props.itemRowClassName,
          shiftHeld: props.shiftHeld,
          onDelete: props.handleDeleteSnippet,
          onStartEditing: props.startEditingSnippet,
          actionGradientStyle: props.actionGradientStyle,
          deleteButtonActiveClassName: props.deleteButtonActiveClassName,
          deleteButtonClassName: props.deleteButtonClassName,
          deleteActionLabel: t({
            id: "dictionary.delete",
            message: "Delete",
          }),
        }}
      />
    </div>
  );
}
