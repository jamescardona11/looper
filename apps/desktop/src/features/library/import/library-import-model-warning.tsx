import { useLingui } from "@lingui/react/macro";
import { Warning } from "@phosphor-icons/react";

export const ImportModelWarning = () => {
  const { t } = useLingui();
  return (
    <div className="flex items-start gap-2 ui-text-body-sm ui-color-warning-strong">
      <Warning size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        {t({
          id: "library.import.no_models",
          message:
            "No models available. Configure Cloud transcription or download the local model in Settings -> Models before transcribing.",
        })}
      </span>
    </div>
  );
};
