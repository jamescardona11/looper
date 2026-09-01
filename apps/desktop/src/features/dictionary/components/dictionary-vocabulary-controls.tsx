import { useLingui } from "@lingui/react/macro";
import type { KeyboardEvent } from "react";

import type { SuggestedCorrection } from "../../../data/capture/corrections";
import { DictionarySuggestions } from "./dictionary-suggestions";

type DictionaryVocabularyControlsProps = {
  embedded: boolean;
  suggestions: SuggestedCorrection[];
  itemRowClassName: string;
  deleteButtonClassName: string;
  onAcceptSuggestion: (from: string, to: string) => void;
  onDismissSuggestion: (from: string, to: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  onAdd: () => void;
  placeholder: string;
  searching: boolean;
  hasEntries: boolean;
  metaLabel: string;
  hintLabel: string;
  showSuggestions?: boolean;
  title?: string;
  description?: string;
};

export function DictionaryVocabularyControls(
  props: DictionaryVocabularyControlsProps,
) {
  const { t } = useLingui();
  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    props.onAdd();
  };
  return (
    <>
      <div className="min-w-0">
        {props.title ? (
          <p className="ui-text-title-strong ui-color-primary text-balance">
            {props.title}
          </p>
        ) : props.embedded ? null : (
          <p className="ui-text-title-strong ui-color-primary text-balance">
            {t({
              id: "dictionary.section.dictionary_title",
              message: "Dictionary",
            })}
          </p>
        )}
        <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
          {props.description ??
            t({
              id: "dictionary.section.dictionary_description",
              message: "Add custom words Looper should recognize.",
            })}
        </p>
      </div>
      {props.showSuggestions === false ? null : (
        <DictionarySuggestions
          suggestions={props.suggestions}
          itemRowClassName={props.itemRowClassName}
          deleteButtonClassName={props.deleteButtonClassName}
          onAccept={props.onAcceptSuggestion}
          onDismiss={props.onDismissSuggestion}
        />
      )}
      <div className="mt-4 flex h-10 items-center rounded-lg border border-border-primary bg-surface-surface px-3 shadow-sm transition-colors focus-within:border-border-hover">
        <input
          data-studio-focus="word"
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          onKeyDown={addOnEnter}
          placeholder={props.placeholder}
          aria-label={t({
            id: "dictionary.search_or_add_aria",
            message: "Add or search dictionary entry",
          })}
          className="h-8 w-full min-w-0 bg-transparent ui-text-body-lg ui-color-primary placeholder-content-disabled outline-hidden"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ui-text-meta ui-color-muted">
        <span
          className="tabular-nums"
          role={props.searching && props.hasEntries ? "status" : undefined}
        >
          {props.metaLabel}
        </span>
        <span>{props.hintLabel}</span>
      </div>
    </>
  );
}
