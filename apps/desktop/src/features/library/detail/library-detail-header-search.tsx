import { useLingui } from "@lingui/react/macro";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

import { LibraryDetailSpeakerFilter } from "./library-detail-header-filter";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

type SearchProps = Pick<
  LibraryDetailHeaderProps,
  | "filterMenuOpen"
  | "filterMenuRef"
  | "handleSearchChange"
  | "handleSearchNavigate"
  | "searchMatchLabel"
  | "searchQuery"
  | "setFilterMenuOpen"
  | "setSpeakerFilter"
  | "speakerFilter"
  | "speakers"
>;

const SEARCH_FIELD = [
  "relative flex w-full max-w-lg items-center gap-2 px-1 py-0.5",
  "border-b border-[var(--color-border-secondary)]",
  "focus-within:border-[var(--color-border-hover)] transition-colors",
].join(" ");
const SEARCH_INPUT = [
  "bg-transparent ui-text-label text-content-secondary",
  "placeholder-content-disabled outline-hidden w-full",
].join(" ");

export function LibraryDetailSearch(props: SearchProps) {
  const { t } = useLingui();
  const handleKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.handleSearchNavigate(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.handleSearchChange("");
    }
  };

  return (
    <div className="col-start-2 row-start-2 flex items-center justify-center gap-1.5">
      <div className={SEARCH_FIELD}>
        <MagnifyingGlass
          size={12}
          className="text-content-disabled shrink-0"
          aria-hidden="true"
        />
        <input
          type="text"
          value={props.searchQuery}
          onChange={(event) => props.handleSearchChange(event.target.value)}
          onKeyDown={handleKeys}
          placeholder={t({
            id: "library.modal.search.placeholder",
            message: "Search transcript...",
          })}
          aria-label={t({
            id: "library.modal.search.aria",
            message: "Search transcript",
          })}
          className={SEARCH_INPUT}
        />
        {props.searchMatchLabel !== null ? (
          <span className="ui-text-micro tabular-nums text-content-disabled shrink-0 whitespace-nowrap">
            {props.searchMatchLabel}
          </span>
        ) : null}
        {props.searchQuery ? (
          <button
            onClick={() => props.handleSearchChange("")}
            aria-label={t({
              id: "library.modal.search.clear",
              message: "Clear search",
            })}
            className="text-content-disabled hover:text-content-muted transition-colors shrink-0"
          >
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <LibraryDetailSpeakerFilter {...props} />
    </div>
  );
}
