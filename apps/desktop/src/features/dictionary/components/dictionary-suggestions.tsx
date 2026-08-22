import { useLingui } from "@lingui/react/macro";
import { ArrowRight, Check, X } from "@phosphor-icons/react";

import type { SuggestedCorrection } from "../../../data/capture/corrections";

type DictionarySuggestionsProps = {
  suggestions: SuggestedCorrection[];
  itemRowClassName: string;
  deleteButtonClassName: string;
  onAccept: (from: string, to: string) => void;
  onDismiss: (from: string, to: string) => void;
};

export function DictionarySuggestions(props: DictionarySuggestionsProps) {
  const { t } = useLingui();
  if (props.suggestions.length === 0) return null;
  return (
    <div className="mt-4 min-w-0 rounded-xl border border-border-primary bg-surface-secondary p-3">
      <p className="ui-text-title-strong ui-color-primary text-balance">
        {t({
          id: "dictionary.suggested_corrections.title",
          message: "Suggested corrections",
        })}
      </p>
      <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
        {t({
          id: "dictionary.suggested_corrections.description",
          message:
            "Words you corrected after inserting a dictation, seen more than once. Accepting adds the corrected word to the dictionary.",
        })}
      </p>
      <div className="mt-3">
        {props.suggestions.map((suggestion) => (
          <div
            key={`${suggestion.from}->${suggestion.to}`}
            className={props.itemRowClassName}
          >
            <div className="flex flex-1 items-center min-w-0 gap-2 px-2.5 py-2">
              <span className="ui-text-body-lg ui-color-muted truncate min-w-0 flex-1 basis-0 line-through">
                {suggestion.from}
              </span>
              <ArrowRight
                size={14}
                className="shrink-0 text-content-muted"
                aria-hidden="true"
              />
              <span className="ui-text-body-lg ui-color-primary font-medium truncate min-w-0 flex-1 basis-0">
                {suggestion.to}
              </span>
              <span className="ui-text-meta ui-color-muted tabular-nums shrink-0">
                {t({
                  id: "dictionary.suggested_corrections.count",
                  message: `×${suggestion.count}`,
                })}
              </span>
            </div>
            <div className="flex items-center gap-1 pr-2 shrink-0">
              <button
                onClick={() => props.onAccept(suggestion.from, suggestion.to)}
                className="rounded p-1 text-content-muted transition-colors hover:bg-[var(--surface-interactive)] hover:text-success"
                title={t({
                  id: "dictionary.suggested_corrections.accept",
                  message: "Add to dictionary",
                })}
                aria-label={t({
                  id: "dictionary.suggested_corrections.accept_aria",
                  message: `Add ${suggestion.to} to dictionary`,
                })}
              >
                <Check size={14} aria-hidden="true" />
              </button>
              <button
                onClick={() => props.onDismiss(suggestion.from, suggestion.to)}
                className={props.deleteButtonClassName}
                title={t({
                  id: "dictionary.suggested_corrections.dismiss",
                  message: "Don't suggest again",
                })}
                aria-label={t({
                  id: "dictionary.suggested_corrections.dismiss_aria",
                  message: `Dismiss suggestion ${suggestion.to}`,
                })}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
