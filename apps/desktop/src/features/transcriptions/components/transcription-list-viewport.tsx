import { useLingui as useListStateTranslations } from "@lingui/react/macro";
import { MagnifyingGlass as SearchIcon } from "@phosphor-icons/react";
import { Virtuoso as VirtualList } from "react-virtuoso";
import type { ComponentProps } from "react";
import Shimmer from "../../../shared/ui/Shimmer";
import type {
  TranscriptionListEntry,
  TranscriptionListViewState,
} from "../transcription-list-policy";

const EMPTY_WAVEFORM_HEIGHTS = [12, 22, 30, 17, 40, 26, 16, 33, 23, 12];
const VIRTUAL_COMPONENTS = {
  Header: () => <div className="h-3" />,
  Footer: () => <div className="h-3" />,
};

function EmptyTranscriptions({ shortcutKeys }: { shortcutKeys: string[] }) {
  const { t } = useListStateTranslations();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center pb-[10vh]">
      <div className="flex h-10 items-center gap-1.5" aria-hidden="true">
        {EMPTY_WAVEFORM_HEIGHTS.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className="w-1 rounded-full bg-[var(--color-accent)]"
            style={{ height }}
          />
        ))}
      </div>
      <p className="mt-6 ui-text-title ui-color-primary font-semibold">
        {t({
          id: "transcriptions.list.empty.title",
          message: "Turn your voice into text",
        })}
      </p>
      <p className="mt-1.5 ui-text-body-sm ui-color-muted max-w-sm">
        {t({
          id: "transcriptions.list.empty",
          message: "Your recent transcriptions will appear here",
        })}
      </p>
      <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-3 text-left">
        <div className="rounded-lg border border-border-primary bg-surface-surface px-4 py-3.5">
          <p className="ui-text-label-strong ui-color-primary">
            {t({
              id: "transcriptions.list.empty.dictate.title",
              message: "Dictate anywhere",
            })}
          </p>
          <p className="mt-1 ui-text-micro ui-color-muted leading-relaxed">
            {t({
              id: "transcriptions.list.empty.dictate.detail",
              message: "Hold the shortcut, talk, release to insert.",
            })}
          </p>
          <p className="mt-2.5 flex items-center gap-1" aria-hidden="true">
            {shortcutKeys.map((key) => (
              <kbd
                key={key}
                className="rounded-md border border-border-secondary bg-surface-elevated px-1.5 py-0.5 ui-text-micro ui-color-secondary font-medium"
              >
                {key}
              </kbd>
            ))}
          </p>
        </div>
        <div className="rounded-lg border border-border-primary bg-surface-surface px-4 py-3.5">
          <p className="ui-text-label-strong ui-color-primary">
            {t({
              id: "transcriptions.list.empty.import.title",
              message: "Transcribe audio",
            })}
          </p>
          <p className="mt-1 ui-text-micro ui-color-muted leading-relaxed">
            {t({
              id: "transcriptions.list.empty.import.detail",
              message: "Drop an audio file anywhere in this window.",
            })}
          </p>
          <p className="mt-2.5 ui-text-micro ui-color-disabled">
            {t({
              id: "transcriptions.list.empty.import.formats",
              message: "MP3 · WAV · M4A · MP4",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function NoTranscriptionResults({ text }: { text: string }) {
  const { t } = useListStateTranslations();
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <SearchIcon
        size={18}
        className="text-content-disabled mb-2"
        aria-hidden="true"
      />
      <p className="ui-text-body-sm ui-color-muted">
        {text
          ? t({
              id: "transcriptions.list.no_results",
              message: `No results for "${text}"`,
            })
          : t({
              id: "transcriptions.list.no_results_filters",
              message: "No results for selected filters",
            })}
      </p>
    </div>
  );
}

function LoadingTranscriptions() {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col gap-3 pt-4 pr-3 pointer-events-none"
      aria-hidden="true"
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="rounded-lg border border-border-primary bg-surface-surface px-3 py-2.5"
        >
          <Shimmer className="h-3 w-24" />
          <Shimmer className="mt-2.5 h-3.5 w-3/4" />
          <Shimmer className="mt-1.5 h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

type VirtualListProps = Pick<
  ComponentProps<typeof VirtualList<TranscriptionListEntry>>,
  "computeItemKey" | "itemContent"
>;

export function TranscriptionListViewport(props: {
  state: TranscriptionListViewState;
  shortcutKeys: string[];
  entries: TranscriptionListEntry[];
  computeItemKey: VirtualListProps["computeItemKey"];
  renderEntry: VirtualListProps["itemContent"];
}) {
  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div
        className="pointer-events-none absolute left-0 right-3 top-0 h-6 z-10"
        style={{
          background:
            "linear-gradient(to bottom, var(--color-bg-tertiary), transparent)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-0 right-3 bottom-0 h-8 z-10"
        style={{
          background:
            "linear-gradient(to top, var(--color-bg-tertiary), transparent)",
        }}
        aria-hidden="true"
      />
      {props.state.kind === "empty" ? (
        <EmptyTranscriptions shortcutKeys={props.shortcutKeys} />
      ) : props.state.kind === "no-results" ? (
        <NoTranscriptionResults text={props.state.text} />
      ) : (
        <>
          {props.state.loading ? <LoadingTranscriptions /> : null}
          <VirtualList
            style={{ height: "100%" }}
            data={props.state.loading ? [] : props.entries}
            defaultItemHeight={124}
            overscan={400}
            increaseViewportBy={200}
            computeItemKey={props.computeItemKey}
            components={VIRTUAL_COMPONENTS}
            itemContent={props.renderEntry}
            className="custom-scrollbar scrollbar-gutter"
          />
        </>
      )}
    </div>
  );
}
