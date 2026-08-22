import { LibraryDetailActions } from "./library-detail-header-actions";
import {
  LibraryDetailSourceMetadata,
  LibraryDetailTaxonomy,
} from "./library-detail-header-metadata";
import { LibraryDetailSearch } from "./library-detail-header-search";
import { LibraryDetailTitle } from "./library-detail-header-title";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

export function LibraryDetailHeader(props: LibraryDetailHeaderProps) {
  return (
    <header className="shrink-0 border-b border-[var(--color-border-primary)] px-5 pt-1.5 pb-2">
      <div className="grid grid-cols-3 items-center gap-x-4 gap-y-1">
        <LibraryDetailTitle {...props} />
        <LibraryDetailSearch {...props} />
        <LibraryDetailActions {...props} />
        <LibraryDetailSourceMetadata {...props} />
        <LibraryDetailTaxonomy {...props} />
      </div>
    </header>
  );
}
