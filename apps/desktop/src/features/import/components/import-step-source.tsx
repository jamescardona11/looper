import { plural as pluralMessage } from "@lingui/core/macro";
import { useLingui as useImportSourceTranslations } from "@lingui/react/macro";
import SourceMark from "../../../shared/ui/DotMatrix";
import SourcePicker from "../../../shared/ui/SegmentedControl";
import type { DetectedApp } from "../../../contracts";
import { OnboardingHeader } from "../../onboarding/steps/shared";
import { importSourceName, importSourceOptions } from "./import-step-policy";

interface ImportStepSourceProps {
  sources: DetectedApp[];
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
}

const SOURCE_SWITCH_CLASS =
  "inline-flex items-center gap-0.5 rounded-xl border border-border-primary bg-surface-secondary p-1";
const SOURCE_BUTTON_CLASS =
  "relative rounded-lg px-4 py-1.5 ui-text-label font-medium normal-case transition-colors duration-200 z-10";
const SOURCE_FRAME_CLASS = "flex w-full flex-col items-center";
const PICKER_FRAME_CLASS = "relative mb-4 flex w-full justify-center";
const SINGLE_SOURCE_CLASS =
  "relative mb-4 inline-flex items-center gap-2 rounded-xl border border-border-primary bg-surface-secondary px-3 py-1.5";
const SOURCE_PICKER_STYLE = {
  activeIndicatorLayoutId: "import-app-picker",
  className: SOURCE_SWITCH_CLASS,
  buttonClassName: SOURCE_BUTTON_CLASS,
  activeButtonClassName: "text-content-primary",
  inactiveButtonClassName: "text-content-muted hover:text-content-secondary",
  activeIndicatorClassName:
    "absolute inset-0 rounded-lg border border-border-primary bg-surface-elevated shadow-sm z-[-1]",
};
const SOURCE_MARK_STYLE = {
  rows: 1,
  cols: 3,
  activeDots: [0, 2],
  dotSize: 2,
  gap: 2,
  color: "var(--color-text-muted)",
};

export function ImportStepSource(props: ImportStepSourceProps) {
  const { t } = useImportSourceTranslations();
  const multipleSources = props.sources.length > 1;
  const sourceName = importSourceName(props.sources, props.selectedSourceId);
  return (
    <div className={SOURCE_FRAME_CLASS}>
      <OnboardingHeader
        title={t({
          id: "import.title",
          message: "Want to bring your settings over?",
        })}
        subtitle={t({
          id: "import.subtitle",
          message: pluralMessage(props.sources.length, {
            one: "We found another dictation app. Choose what to import.",
            other: "We found other dictation apps. Choose what to import.",
          }),
        })}
      />
      {multipleSources && props.selectedSourceId ? (
        <div className={PICKER_FRAME_CLASS}>
          <SourcePicker
            {...SOURCE_PICKER_STYLE}
            value={props.selectedSourceId}
            options={importSourceOptions(props.sources)}
            onChange={props.onSelectSource}
            ariaLabel={t({
              id: "import.app_picker.aria",
              message: "Select app to import from",
            })}
          />
        </div>
      ) : null}
      {!multipleSources && sourceName ? (
        <div className={SINGLE_SOURCE_CLASS}>
          <SourceMark {...SOURCE_MARK_STYLE} />
          <span className="ui-text-label font-medium text-content-secondary">
            {sourceName}
          </span>
        </div>
      ) : null}
    </div>
  );
}
