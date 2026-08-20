import { useLingui } from "@lingui/react/macro";
import { CalendarBlank, Waveform } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { LibraryItem } from "../../../types";
import { useLibraryItems } from "../queries";
import { isCaptureItem } from "./library-detail-policy";
import { formatDuration } from "./library-utils";

type HomeMeetingActivityProps = {
  isActive: boolean;
  onOpen: (item: LibraryItem) => void;
};

export function HomeMeetingActivity({
  isActive,
  onOpen,
}: HomeMeetingActivityProps) {
  const { t } = useLingui();
  const { data } = useLibraryItems({ since_days: 1 }, isActive);
  const captures = useMemo(
    () => (data?.pages.flatMap((page) => page.items) ?? []).filter(isCaptureItem),
    [data],
  );

  if (captures.length === 0) return null;

  return (
    <section className="mt-5" aria-labelledby="home-meetings-title">
      <div className="mb-2 flex items-center gap-2">
        <CalendarBlank size={13} className="text-content-disabled" />
        <h2
          id="home-meetings-title"
          className="ui-text-uppercase-micro text-content-disabled"
        >
          {t({ id: "home.captures.today", message: "Recorded today" })}
        </h2>
      </div>
      <div className="flex flex-col gap-1">
        {captures.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item)}
            className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border-primary hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-10 text-[var(--color-accent)]">
              <Waveform size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate ui-text-body-sm-strong text-content-primary">
                {item.name}
              </span>
              <span className="mt-0.5 block ui-text-micro text-content-muted">
                {formatDuration(item.duration_seconds)} · {statusLabel(item)}
              </span>
            </span>
            <span className="translate-x-1 text-content-disabled opacity-0 transition-[opacity,transform] group-hover:translate-x-0 group-hover:opacity-100">
              →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function statusLabel(item: LibraryItem) {
  switch (item.status.type) {
    case "complete":
      return "Ready";
    case "error":
      return "Needs attention";
    case "recording":
      return "Recording";
    case "transcribing":
    case "importing":
      return "Transcribing";
    default:
      return "Queued";
  }
}
