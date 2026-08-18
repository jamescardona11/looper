import { useLingui as useImportFeedbackTranslations } from "@lingui/react/macro";

interface ImportStepFeedbackProps {
  needsModelChoice: boolean;
  applyFailed: boolean;
}

const MODEL_NOTICE_CLASS =
  "relative ui-text-meta text-content-muted text-center mt-3 text-balance";
const APPLY_FAILURE_CLASS =
  "relative ui-text-meta ui-color-error-strong text-center mt-3";

export function ImportStepFeedback(props: ImportStepFeedbackProps) {
  const { t } = useImportFeedbackTranslations();
  return (
    <>
      {props.needsModelChoice ? (
        <p className={MODEL_NOTICE_CLASS}>
          {t({
            id: "import.model.unrecognized",
            message:
              "We don't recognize this app's model, so you'll pick one on the next step.",
          })}
        </p>
      ) : null}
      {props.applyFailed ? (
        <p className={APPLY_FAILURE_CLASS}>
          {t({
            id: "import.apply.failed",
            message: "Import failed. Try again or skip.",
          })}
        </p>
      ) : null}
    </>
  );
}
