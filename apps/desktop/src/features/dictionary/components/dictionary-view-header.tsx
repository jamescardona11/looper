import { useLingui as useDictionaryI18n } from "@lingui/react/macro";
import { Warning as AlertTriangle } from "@phosphor-icons/react";

import DictionaryDotMatrix from "../../../shared/ui/DotMatrix";
import DictionaryScreenHeader from "../../../shared/ui/ScreenHeader";

type DictionaryViewHeaderProps = {
  embedded: boolean;
  showWarning: boolean;
  warningTooltipId: string;
  modelLabel: string | null | undefined;
};

export function DictionaryViewHeader(props: DictionaryViewHeaderProps) {
  const { t: translate } = useDictionaryI18n();
  if (props.embedded) return null;
  return (
    <DictionaryScreenHeader
      className="mb-6 mt-2 md:-mt-6"
      icon={
        <DictionaryDotMatrix
          rows={2}
          cols={3}
          activeDots={[0, 1, 2, 3]}
          dotSize={3}
          gap={3}
          color="var(--color-section-marker)"
        />
      }
      title={translate({
        id: "dictionary.combined.title",
        message: "Dictionary & Replacements",
      })}
      description={translate({
        id: "dictionary.combined.description",
        message:
          "Add custom words the system should recognize, and set automatic word replacements.",
      })}
      titleAdornment={
        props.showWarning && (
          <span className={headerAdornmentClass()}>
            <button
              type="button"
              aria-describedby={props.warningTooltipId}
              aria-label={translate({
                id: "dictionary.warning_aria",
                message: "Warning: model compatibility issue",
              })}
              className={warningButtonClass()}
            >
              <AlertTriangle aria-hidden="true" size={18} />
            </button>
            <span
              id={props.warningTooltipId}
              role="tooltip"
              className={tooltipPositionClass()}
            >
              <span
                className="block rounded-lg border bg-surface-overlay p-3 ui-color-warning shadow-xl leading-relaxed ui-text-body-sm shadow-[var(--shadow-tooltip)]"
                style={{
                  borderColor:
                    "color-mix(in srgb, " +
                    "var(--color-warning) 30%, transparent)",
                }}
              >
                {translate({
                  id: "dictionary.warning",
                  message: `Dictionary works only for models with dictionary support. Current model ${props.modelLabel} will ignore these entries until you switch to a compatible model.`,
                })}
              </span>
            </span>
          </span>
        )
      }
    />
  );
}

function headerAdornmentClass() {
  return [
    "group relative inline-flex shrink-0 items-center",
    "justify-center self-center translate-y-[3px]",
  ].join(" ");
}

function warningButtonClass() {
  return [
    "inline-flex items-center justify-center ui-color-warning",
    "opacity-90 hover:opacity-100 cursor-default outline-hidden",
  ].join(" ");
}

function tooltipPositionClass() {
  return [
    "pointer-events-none absolute left-1/2 top-full z-50 hidden w-80",
    "-translate-x-1/2 pt-2 text-left font-sans tracking-normal",
    "group-hover:block group-focus-within:block",
  ].join(" ");
}
