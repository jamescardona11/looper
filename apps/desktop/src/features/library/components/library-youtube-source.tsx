import { useLingui } from "@lingui/react/macro";
import { CircleNotch } from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";
import type { YoutubeImportMetadata } from "../../../types";
import { formatDuration } from "./library-utils";

type YoutubeSourceProps = {
  url: string;
  metadata: YoutubeImportMetadata | null;
  isProbing: boolean;
  onUrlChange: (url: string) => void;
  onProbe: () => void;
};

export const YoutubeSource = ({
  url,
  metadata,
  isProbing,
  onUrlChange,
  onProbe,
}: YoutubeSourceProps) => {
  const { t } = useLingui();
  const probeOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onProbe();
  };
  return (
    <>
      <div>
        <label
          htmlFor="youtube-import-url"
          className="ui-text-label text-content-muted"
        >
          {t({ id: "library.youtube.url", message: "YouTube URL" })}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="youtube-import-url"
            type="url"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={probeOnEnter}
            placeholder="https://www.youtube.com/watch?v=..."
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border-primary bg-surface-surface px-3 py-2 ui-text-input text-content-primary outline-none focus:border-border-hover"
          />
          <button
            type="button"
            onClick={onProbe}
            disabled={!url.trim() || isProbing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-primary bg-surface-surface px-3 py-2 ui-text-body-sm text-content-secondary transition-colors hover:bg-surface-overlay hover:text-content-primary disabled:opacity-50"
          >
            {isProbing && <CircleNotch size={13} className="animate-spin" />}
            {t({ id: "library.youtube.review", message: "Review" })}
          </button>
        </div>
      </div>
      {metadata && <YoutubeMetadataCard metadata={metadata} />}
    </>
  );
};

const YoutubeMetadataCard = ({
  metadata,
}: {
  metadata: YoutubeImportMetadata;
}) => {
  const details = [
    metadata.channel,
    metadata.duration_seconds == null
      ? null
      : formatDuration(metadata.duration_seconds),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary px-3 py-2.5">
      <div className="ui-text-body-sm font-medium text-content-primary">
        {metadata.title}
      </div>
      <div className="mt-1 ui-text-meta text-content-muted">{details}</div>
    </div>
  );
};
