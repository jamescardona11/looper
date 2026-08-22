import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Warning as AlertTriangle } from "@phosphor-icons/react";

import { openFfmpegInstallHelp } from "../../../data/library";
import { getLibraryErrorDetails } from "../shared/library-utils";

const ERROR_COPY = {
  title: msg({ id: "library.modal.import_failed", message: "Import failed" }),
  help: msg({ id: "library.modal.ffmpeg_help", message: "FFmpeg Help" }),
};
const CARD_CLASS = [
  "max-w-[280px] rounded-xl border border-red-500/30",
  "bg-red-500/10 px-4 py-3 text-center",
].join(" ");
const HELP_CLASS = [
  "mt-2 ui-text-meta ui-color-error-faint underline",
  "decoration-red-400/60 ui-hover-error-50",
].join(" ");

export function LibraryTranscriptError({ message }: { message: string }) {
  const { i18n } = useLingui();
  const details = getLibraryErrorDetails(message);

  return (
    <div className="flex h-full items-center justify-center">
      <div className={CARD_CLASS}>
        <div className="flex items-center justify-center gap-2 ui-color-error-tint">
          <AlertTriangle size={14} />
          <span className="ui-text-label font-medium">
            {i18n._(ERROR_COPY.title)}
          </span>
        </div>
        <p className="mt-2 ui-text-meta leading-[14px] ui-color-error-tint select-text cursor-text">
          {details.message}
        </p>
        {details.showFfmpegHelp ? (
          <button
            type="button"
            onClick={() => openFfmpegInstallHelp().catch(() => {})}
            className={HELP_CLASS}
          >
            {i18n._(ERROR_COPY.help)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
