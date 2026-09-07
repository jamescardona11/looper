import { ArrowRight } from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";

type PairInput = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  studioFocusTarget?: string;
};

type DictionaryPairFormProps = {
  title: string | null;
  description: string;
  gridClassName: string;
  primary: PairInput;
  secondary: PairInput;
  onSubmit: () => void;
  countLabel: string;
  hintLabel: string;
};

const INPUT_FRAME =
  "flex h-10 items-center rounded-lg border border-border-primary bg-surface-surface px-3 shadow-sm transition-colors focus-within:border-border-hover";
const INPUT_CLASS =
  "h-8 w-full min-w-0 bg-transparent ui-text-body-lg ui-color-primary placeholder-content-disabled outline-hidden";

export function DictionaryPairForm(props: DictionaryPairFormProps) {
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <>
      <div className="min-w-0">
        {props.title === null ? null : (
          <p className="ui-text-title-strong ui-color-primary text-balance">
            {props.title}
          </p>
        )}
        <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
          {props.description}
        </p>
      </div>

      <div className={props.gridClassName}>
        <div className={INPUT_FRAME}>
          <input
            value={props.primary.value}
            onChange={(event) => props.primary.onChange(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={props.primary.placeholder}
            aria-label={props.primary.ariaLabel}
            data-studio-focus={props.primary.studioFocusTarget}
            className={INPUT_CLASS}
          />
        </div>
        <div className="hidden sm:flex items-center justify-center pb-2 text-content-muted">
          <ArrowRight size={14} aria-hidden="true" />
        </div>
        <div className={INPUT_FRAME}>
          <input
            value={props.secondary.value}
            onChange={(event) => props.secondary.onChange(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={props.secondary.placeholder}
            aria-label={props.secondary.ariaLabel}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ui-text-meta ui-color-muted">
        <span className="tabular-nums">{props.countLabel}</span>
        <span>{props.hintLabel}</span>
      </div>
    </>
  );
}
