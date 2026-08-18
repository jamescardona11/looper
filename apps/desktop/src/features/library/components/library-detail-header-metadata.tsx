import { formatDuration } from "./library-utils";
import { LibraryDetailSpeakers } from "./library-detail-header-speakers";
import { LibraryDetailTags } from "./library-detail-header-tags";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

type SourceProps = Pick<
  LibraryDetailHeaderProps,
  "audioDuration" | "createdAtLabel" | "modelLabel"
>;

export function LibraryDetailSourceMetadata({
  audioDuration,
  createdAtLabel,
  modelLabel,
}: SourceProps) {
  const showsSeparator = Boolean(createdAtLabel && audioDuration > 0);
  return (
    <>
      <div className="col-start-1 row-start-2 flex items-center min-w-0 pl-[30px] ui-text-meta text-content-disabled">
        <span className="whitespace-nowrap">{modelLabel}</span>
      </div>
      <div className="col-start-1 row-start-3 flex items-center gap-2 min-w-0 pl-[30px] ui-text-meta text-content-disabled">
        {createdAtLabel ? (
          <span className="whitespace-nowrap">{createdAtLabel}</span>
        ) : null}
        {showsSeparator ? (
          <span className="opacity-40" aria-hidden="true">
            ·
          </span>
        ) : null}
        {audioDuration > 0 ? (
          <span className="tabular-nums">{formatDuration(audioDuration)}</span>
        ) : null}
      </div>
    </>
  );
}

export function LibraryDetailTaxonomy(props: LibraryDetailHeaderProps) {
  return (
    <div className="col-start-3 row-start-3 flex items-center justify-end gap-2 min-w-0">
      <LibraryDetailTags {...props} />
      <div
        className="h-3.5 w-px bg-[var(--color-border-primary)] mx-1"
        aria-hidden="true"
      />
      <LibraryDetailSpeakers {...props} />
    </div>
  );
}
