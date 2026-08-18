import { useLingui } from "@lingui/react/macro";
import type { CSSProperties } from "react";

import type { Replacement } from "../../../types";
import { DictionaryPairForm } from "./dictionary-pair-form";
import { DictionaryPairList } from "./dictionary-pair-list";

type DictionaryReplacementsSectionProps = {
  visible: boolean;
  vocabularyVisible: boolean;
  embedded: boolean;
  newFrom: string;
  setNewFrom: (value: string) => void;
  newTo: string;
  setNewTo: (value: string) => void;
  handleAddReplacement: () => void;
  replacementCountLabel: string;
  replacementHintLabel: string;
  replacementsPending: boolean;
  panelBodyClassName: string;
  replacements: Replacement[];
  fadeItemThreshold: number;
  panelBodyFadeClassName: string;
  loading: boolean;
  editingReplacementIndex: number | null;
  editRowClassName: string;
  editingFrom: string;
  setEditingFrom: (value: string) => void;
  editingTo: string;
  setEditingTo: (value: string) => void;
  cancelReplacementEdit: () => void;
  handleEditReplacementCommit: () => void;
  itemRowClassName: string;
  shiftHeld: boolean;
  handleDeleteReplacement: (index: number) => void;
  startEditingReplacement: (index: number) => void;
  actionGradientStyle: CSSProperties;
  deleteButtonActiveClassName: string;
  deleteButtonClassName: string;
};

const FORM_GRID =
  "mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end";

export function DictionaryReplacementsSection(
  props: DictionaryReplacementsSectionProps,
) {
  const { t } = useLingui();
  const rows = props.replacements.map((replacement, index) => ({
    key: `${replacement.from}-${index}`,
    primary: replacement.from,
    secondary: replacement.to || (
      <span className="text-content-muted italic">
        {t({
          id: "dictionary.replacements.remove_value",
          message: "remove",
        })}
      </span>
    ),
    deleteLabel: t({
      id: "dictionary.replacements.delete",
      message: `Delete replacement for ${replacement.from}`,
    }),
  }));
  return (
    <div
      className={`min-w-0 ${
        props.visible
          ? props.vocabularyVisible
            ? "border-t border-border-primary pt-6 md:border-t-0 md:border-l md:pl-6 md:pt-0 lg:pl-8"
            : ""
          : "hidden"
      }`}
    >
      <DictionaryPairForm
        title={
          props.embedded
            ? null
            : t({
                id: "dictionary.section.replacements_title",
                message: "Replacements",
              })
        }
        description={t({
          id: "dictionary.section.replacements_description",
          message: "Swap common phrases automatically after transcription.",
        })}
        gridClassName={FORM_GRID}
        primary={{
          value: props.newFrom,
          onChange: props.setNewFrom,
          placeholder: t({
            id: "dictionary.replacements.find",
            message: "Find word...",
          }),
          ariaLabel: t({
            id: "dictionary.replacements.find_aria",
            message: "Find word to replace",
          }),
        }}
        secondary={{
          value: props.newTo,
          onChange: props.setNewTo,
          placeholder: t({
            id: "dictionary.replacements.replace_with",
            message: "Replace with...",
          }),
          ariaLabel: t({
            id: "dictionary.replacements.replace_with_aria",
            message: "Replace with",
          }),
        }}
        onSubmit={props.handleAddReplacement}
        countLabel={props.replacementCountLabel}
        hintLabel={props.replacementHintLabel}
      />
      <DictionaryPairList
        pending={props.replacementsPending}
        bodyClassName={props.panelBodyClassName}
        rows={rows}
        fadeItemThreshold={props.fadeItemThreshold}
        panelBodyFadeClassName={props.panelBodyFadeClassName}
        loading={props.loading}
        emptyTitle={t({
          id: "dictionary.replacements.none",
          message: "No replacements yet",
        })}
        emptyDescription={t({
          id: "dictionary.replacements.none_description",
          message:
            "Add a find and replace pair above, then press Enter to save it here.",
        })}
        editing={{
          index: props.editingReplacementIndex,
          rowClassName: props.editRowClassName,
          marker: "data-replacement-edit",
          primary: props.editingFrom,
          onPrimaryChange: props.setEditingFrom,
          secondary: props.editingTo,
          onSecondaryChange: props.setEditingTo,
          secondaryPlaceholder: t({
            id: "dictionary.replacements.replace_with",
            message: "Replace with...",
          }),
          onCancel: props.cancelReplacementEdit,
          onCommit: props.handleEditReplacementCommit,
        }}
        actions={{
          itemRowClassName: props.itemRowClassName,
          shiftHeld: props.shiftHeld,
          onDelete: props.handleDeleteReplacement,
          onStartEditing: props.startEditingReplacement,
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
