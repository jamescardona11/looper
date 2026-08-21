import { useLingui } from "@lingui/react/macro";
import { Check, Funnel } from "@phosphor-icons/react";

import { HeaderMenuSurface } from "./library-detail-header-menu";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

type FilterProps = Pick<
  LibraryDetailHeaderProps,
  | "filterMenuOpen"
  | "filterMenuRef"
  | "setFilterMenuOpen"
  | "setSpeakerFilter"
  | "speakerFilter"
  | "speakers"
>;

const MENU_SURFACE = [
  "absolute left-0 top-full mt-1 z-[120] w-40 rounded-md",
  "border border-border-secondary/80 bg-surface-overlay",
  "shadow-lg shadow-black/40 overflow-hidden",
].join(" ");
const ALL_OPTION = [
  "w-full text-left px-2.5 py-1.5 ui-text-meta font-medium",
  "hover:bg-surface-elevated/70 transition-colors",
].join(" ");
const SPEAKER_OPTION = [
  "w-full flex items-center gap-2 text-left px-2.5 py-1.5",
  "ui-text-meta font-medium hover:bg-surface-elevated/70 transition-colors",
].join(" ");

export function LibraryDetailSpeakerFilter(props: FilterProps) {
  const { t } = useLingui();
  const label = t({
    id: "library.detail.filter.aria",
    message: "Filter by speaker",
  });
  return (
    <div className="relative shrink-0" ref={props.filterMenuRef}>
      <button
        type="button"
        onClick={() => props.setFilterMenuOpen((open) => !open)}
        aria-label={label}
        title={label}
        className={[
          "flex items-center justify-center rounded-md p-1 transition-colors hover:bg-surface-surface",
          props.speakerFilter
            ? "text-[var(--color-cloud-dark)]"
            : "text-content-disabled hover:text-content-primary",
        ].join(" ")}
      >
        <Funnel size={13} weight={props.speakerFilter ? "fill" : "regular"} />
      </button>
      <HeaderMenuSurface
        open={props.filterMenuOpen}
        className={MENU_SURFACE}
        motionStyle="popover"
      >
        <FilterChoices {...props} />
      </HeaderMenuSurface>
    </div>
  );
}

function FilterChoices(props: FilterProps) {
  const { t } = useLingui();
  const select = (speakerId: string | null) => {
    props.setSpeakerFilter(speakerId);
    props.setFilterMenuOpen(false);
  };
  if (props.speakers.length === 0) {
    return (
      <div className="px-2.5 py-2 ui-text-micro text-content-muted">
        {t({
          id: "library.detail.filter.no_speakers",
          message: "No speakers yet",
        })}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => select(null)}
        className={`${ALL_OPTION} ${optionTone(props.speakerFilter === null)}`}
      >
        {t({ id: "library.detail.filter.all", message: "All speakers" })}
      </button>
      {props.speakers.map((speaker) => {
        const selected = props.speakerFilter === speaker.id;
        return (
          <button
            key={speaker.id}
            type="button"
            onClick={() => select(speaker.id)}
            className={`${SPEAKER_OPTION} ${optionTone(selected)}`}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: speaker.color ?? undefined }}
              aria-hidden="true"
            />
            <span className="truncate">{speaker.name}</span>
            {selected ? <Check size={10} className="ml-auto shrink-0" /> : null}
          </button>
        );
      })}
    </>
  );
}

function optionTone(selected: boolean) {
  return selected
    ? "text-content-primary"
    : "text-content-secondary hover:text-content-primary";
}
