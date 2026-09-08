import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { openMeetingAiSettings, openModelsSettings } from "../../data/settings";

export function LibrarySetupAction({
  meetingAi = false,
}: {
  meetingAi?: boolean;
}) {
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const open = async () => {
    setBusy(true);
    setError(false);
    try {
      await (meetingAi ? openMeetingAiSettings() : openModelsSettings());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 ui-text-body-sm">
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="text-accent underline disabled:opacity-50"
      >
        {meetingAi
          ? t({
              id: "library.setup.ai",
              message: "Set up meeting intelligence",
            })
          : t({ id: "library.setup.models", message: "Open models" })}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-error">
          {t({
            id: "library.setup.failed",
            message: "Could not open settings. Try again.",
          })}
        </p>
      )}
    </div>
  );
}
