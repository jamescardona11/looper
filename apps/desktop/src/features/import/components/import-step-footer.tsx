import { useLingui as useImportFooterTranslations } from "@lingui/react/macro";
import { CircleNotch as ProgressIcon } from "@phosphor-icons/react";
import { PRIMARY_BUTTON_CLASS } from "../../onboarding/steps/shared";

interface ImportStepFooterProps {
  pending: boolean;
  importEnabled: boolean;
  onImport: () => void;
  onSkip: () => void;
}

export function ImportStepFooter(props: ImportStepFooterProps) {
  const { t } = useImportFooterTranslations();
  return (
    <>
      <button
        onClick={props.onImport}
        disabled={props.pending || !props.importEnabled}
        className={PRIMARY_BUTTON_CLASS}
      >
        {props.pending ? (
          <>
            <ProgressIcon size={15} className="animate-spin" />
            {t({ id: "import.importing", message: "Importing..." })}
          </>
        ) : (
          t({ id: "import.cta", message: "Import" })
        )}
      </button>
      <button
        onClick={props.onSkip}
        disabled={props.pending}
        className="ui-text-label font-medium text-content-muted hover:text-content-secondary transition-colors disabled:opacity-50"
      >
        {t({ id: "import.skip", message: "Skip for now" })}
      </button>
    </>
  );
}
