import { ArrowLeft, Check } from "@phosphor-icons/react";
import { useState } from "react";

import { LibraryDetailActions } from "./library-detail-header-actions";
import { isCaptureItem } from "./library-detail-policy";
import {
  LibraryDetailSourceMetadata,
  LibraryDetailTaxonomy,
} from "./library-detail-header-metadata";
import { LibraryDetailSearch } from "./library-detail-header-search";
import { LibraryDetailTitle } from "./library-detail-header-title";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

export function LibraryDetailHeader(props: LibraryDetailHeaderProps) {
  if (isCaptureItem(props.item)) {
    return <MeetingDetailHeader {...props} />;
  }

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

function MeetingDetailHeader(props: LibraryDetailHeaderProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const commitNameOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void props.handleNameCommit();
  };

  return (
    <header className="shrink-0 border-b border-border-primary bg-surface-primary py-3">
      <div className="flex min-h-10 items-center gap-3">
        <button
          type="button"
          onClick={props.onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-content-secondary ui-text-body-sm-strong transition-colors hover:bg-surface-secondary hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)]"
        >
          <ArrowLeft size={14} />
          All notes
        </button>
        {props.isEditingName ? (
          <div className="flex min-w-0 max-w-md flex-1 items-center gap-2 border-l border-border-primary pl-3">
            <input
              autoFocus
              aria-label="Edit meeting name"
              value={props.nameDraft}
              onBlur={props.handleNameCommit}
              onChange={(event) => props.setNameDraft(event.target.value)}
              onKeyDown={commitNameOnEnter}
              className="min-w-0 flex-1 border-b border-border-secondary bg-transparent px-1 py-1 ui-text-body-sm-strong text-content-primary outline-none focus:border-[var(--color-toggle-on)]"
            />
            <button
              type="button"
              aria-label="Save meeting name"
              onMouseDown={(event) => event.preventDefault()}
              onClick={props.handleNameCommit}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-secondary hover:text-content-primary"
            >
              <Check size={13} />
            </button>
          </div>
        ) : (
          <div className="hidden items-center gap-2 border-l border-border-primary pl-3 ui-text-micro text-content-muted sm:flex">
            <span className="font-semibold uppercase tracking-[0.14em] text-[var(--color-toggle-on)]">
              Meeting note
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-toggle-on)]"
                aria-hidden="true"
              />
              Saved locally
            </span>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={props.onSummarize}
            className="inline-flex h-10 items-center rounded-xl bg-[var(--color-toggle-on)] px-4 ui-text-body-sm-strong text-surface-primary transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
          >
            Summarize
          </button>
          <LibraryDetailActions
            {...props}
            compact
            onOpenDetails={() => setToolsOpen((open) => !open)}
          />
        </div>
      </div>
      {toolsOpen ? (
        <div className="mt-2 flex min-h-10 items-center justify-between gap-5 border-t border-border-primary pt-3">
          <div className="min-w-0 flex-1">
            <LibraryDetailSearch {...props} />
          </div>
          <LibraryDetailTaxonomy {...props} />
        </div>
      ) : null}
    </header>
  );
}
