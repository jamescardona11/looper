import { useLingui } from "@lingui/react/macro";
import { X, YoutubeLogo } from "@phosphor-icons/react";

const closeButtonClass = [
  "ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
  "text-content-muted transition-colors",
  "hover:bg-surface-elevated hover:text-content-primary",
].join(" ");

type HeadingProps = { onCancel: () => void };

export const FileImportHeading = ({
  summary,
  onCancel,
}: HeadingProps & { summary: string }) => {
  const { t } = useLingui();
  return (
    <div className="flex items-start justify-between px-5 pt-4">
      <div className="min-w-0">
        <h2 className="ui-text-body-lg font-semibold text-content-primary">
          {t({
            id: "library.import.title",
            message: "Transcribe recordings",
          })}
        </h2>
        <p className="mt-0.5 truncate ui-text-meta text-content-muted">
          {summary}
        </p>
      </div>
      <button
        onClick={onCancel}
        aria-label={t({ id: "library.import.close", message: "Close" })}
        className={closeButtonClass}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

export const YoutubeImportHeading = ({ onCancel }: HeadingProps) => {
  const { t } = useLingui();
  return (
    <div className="flex items-start justify-between px-5 pt-4">
      <div className="flex min-w-0 items-start gap-3">
        <YoutubeLogo size={20} className="mt-0.5 shrink-0 text-content-muted" />
        <div className="min-w-0">
          <h2
            id="youtube-import-title"
            className="ui-text-body-lg font-semibold text-content-primary"
          >
            {t({
              id: "library.youtube.title",
              message: "Transcribe a YouTube video",
            })}
          </h2>
          <p className="mt-0.5 ui-text-meta text-content-muted">
            {t({
              id: "library.youtube.description",
              message:
                "Looper downloads one video's audio with yt-dlp, transcribes it locally or with your chosen provider, then removes the temporary download.",
            })}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t({ id: "library.import.close", message: "Close" })}
        className={closeButtonClass}
      >
        <X size={14} />
      </button>
    </div>
  );
};
