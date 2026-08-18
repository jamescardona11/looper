import { useLingui } from "@lingui/react/macro";
import { AnimatePresence } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

import DotMatrix from "../../../shared/ui/DotMatrix";
import { DictionaryEntryRow } from "./dictionary-entry-row";
import { dictionaryEntryLetter } from "./dictionary-view-model";

type DictionaryEntryListProps = {
  entries: string[];
  filteredEntries: string[];
  loading: boolean;
  pending: boolean;
  searching: boolean;
  dictionaryFull: boolean;
  newEntry: string;
  embedded: boolean;
  editingIndex: number | null;
  editingValue: string;
  onEditingValueChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  shiftHeld: boolean;
  onDelete: (index: number) => void;
  onStartEditing: (index: number) => void;
  usage: Record<string, number>;
  panelBodyClassName: string;
  panelBodyFadeClassName: string;
  fadeItemThreshold: number;
  itemRowClassName: string;
  editRowClassName: string;
  actionGradientStyle: CSSProperties;
  deleteButtonClassName: string;
  deleteButtonActiveClassName: string;
};

export function DictionaryEntryList(props: DictionaryEntryListProps) {
  const faded = props.filteredEntries.length > props.fadeItemThreshold;
  const originalIndexes = firstEntryIndexes(props.entries);
  return (
    <div className="relative">
      <div
        aria-busy={props.pending}
        className={`${props.panelBodyClassName}${
          faded ? ` ${props.panelBodyFadeClassName}` : ""
        }`}
      >
        {props.loading ? (
          <DictionaryEntryLoading />
        ) : props.filteredEntries.length === 0 ? (
          <DictionaryEntryEmptyState
            searching={props.searching}
            dictionaryFull={props.dictionaryFull}
            newEntry={props.newEntry}
          />
        ) : (
          <AnimatePresence initial={false}>
            {props.filteredEntries.map((entry, filteredIndex) => {
              const originalIndex = originalIndexes.get(entry) ?? -1;
              const editing = props.editingIndex === originalIndex;
              const reactKey = editing
                ? `${entry}-${originalIndex}-${filteredIndex}`
                : props.embedded
                  ? entry
                  : `${entry}-${originalIndex}-${filteredIndex}`;
              return (
                <DictionaryEntryRow
                  key={reactKey}
                  entry={entry}
                  letterHeader={entryLetterHeader(
                    props.filteredEntries,
                    filteredIndex,
                    props.embedded,
                  )}
                  embedded={props.embedded}
                  editing={editing}
                  editingValue={props.editingValue}
                  onEditingValueChange={props.onEditingValueChange}
                  onEditCommit={props.onEditCommit}
                  onEditCancel={props.onEditCancel}
                  shiftHeld={props.shiftHeld}
                  onDelete={() => props.onDelete(originalIndex)}
                  onStartEditing={() => props.onStartEditing(originalIndex)}
                  itemRowClassName={props.itemRowClassName}
                  editRowClassName={props.editRowClassName}
                  actionGradientStyle={props.actionGradientStyle}
                  deleteButtonClassName={props.deleteButtonClassName}
                  deleteButtonActiveClassName={
                    props.deleteButtonActiveClassName
                  }
                  usageCount={props.usage[entry]}
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>
      {faded ? (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-20"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--color-bg-tertiary))",
          }}
        />
      ) : null}
    </div>
  );
}

function firstEntryIndexes(entries: string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (!indexes.has(entry)) indexes.set(entry, index);
  });
  return indexes;
}

function entryLetterHeader(
  entries: string[],
  index: number,
  embedded: boolean,
): ReactNode {
  const letter = dictionaryEntryLetter(entries[index] ?? "");
  const previous =
    index > 0 ? dictionaryEntryLetter(entries[index - 1]!) : null;
  if (embedded || previous === letter) return null;
  return (
    <p
      aria-hidden="true"
      className={`px-2.5 pb-0.5 ui-text-nano font-semibold ui-color-disabled ${
        index === 0 ? "pt-1" : "pt-3"
      }`}
    >
      {letter}
    </p>
  );
}

function DictionaryEntryLoading() {
  return (
    <div className="flex items-center justify-center py-10">
      <DotMatrix
        rows={2}
        cols={6}
        activeDots={[0, 1, 2, 3, 4, 5]}
        dotSize={3}
        gap={3}
        color="var(--color-content-muted)"
        animated
        className="opacity-60"
      />
    </div>
  );
}

function DictionaryEntryEmptyState({
  searching,
  dictionaryFull,
  newEntry,
}: {
  searching: boolean;
  dictionaryFull: boolean;
  newEntry: string;
}) {
  const { t } = useLingui();
  return (
    <div className="flex flex-col items-start gap-2 py-6 text-content-muted">
      {searching ? (
        <>
          <p className="ui-text-body-lg-strong">
            {t({ id: "dictionary.no_matches", message: "No matches found" })}
          </p>
          <p className="ui-text-body-sm ui-color-muted">
            {dictionaryFull
              ? t({
                  id: "dictionary.full_add_prompt",
                  message: "Delete an entry before adding another.",
                })
              : t({
                  id: "dictionary.add_prompt",
                  message: `Press Enter to add "${newEntry.trim()}" as a new entry.`,
                })}
          </p>
        </>
      ) : (
        <>
          <p className="ui-text-body-lg-strong">
            {t({ id: "dictionary.no_entries", message: "No entries yet" })}
          </p>
          <p className="ui-text-body-sm ui-color-muted text-pretty">
            {t({
              id: "dictionary.no_entries.description",
              message:
                "Add words, phrases, or names above and press Enter to save them here.",
            })}
          </p>
        </>
      )}
    </div>
  );
}
