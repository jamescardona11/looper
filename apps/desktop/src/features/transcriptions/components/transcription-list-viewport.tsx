import { useLingui as useListStateTranslations } from "@lingui/react/macro";
import { MagnifyingGlass as SearchIcon } from "@phosphor-icons/react";
import { Virtuoso as VirtualList } from "react-virtuoso";
import type { ComponentProps } from "react";
import Shimmer from "../../../shared/ui/Shimmer";
import type {
  TranscriptionListEntry,
  TranscriptionListViewState,
} from "../transcription-list-policy";

const EMPTY_WAVEFORM_HEIGHTS = [8, 14, 22, 28, 22, 14, 8];
const VIRTUAL_COMPONENTS = {
  Header: () => <div className="h-3" />,
  Footer: () => <div className="h-3" />,
};

function EmptyTranscriptions({
  shortcutKeys,
  onOpenShortcutSettings,
}: {
  shortcutKeys: string[];
  onOpenShortcutSettings?: () => void;
}) {
  const { t } = useListStateTranslations();
  return (
    <section className="grid w-full place-items-center gap-[9px] rounded-[22px] bg-[var(--desktop-highlight)] px-6 py-11 text-center text-[var(--color-text-primary)]">
      <div
        className="grid h-[38px] w-[38px] place-items-center rounded-[11px] bg-[var(--color-text-primary)]"
        aria-hidden="true"
      >
        <div className="flex h-[28px] items-center gap-[3px]">
          {EMPTY_WAVEFORM_HEIGHTS.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="w-[2px] rounded-full bg-[var(--desktop-highlight)]"
              style={{ height }}
            />
          ))}
        </div>
      </div>
      <p className="ui-text-title font-semibold">
        {t({
          id: "transcriptions.list.empty.title",
          message: "Nothing dictated yet.",
        })}
      </p>
      <p className="mx-auto max-w-[400px] ui-text-body-sm leading-relaxed text-[var(--color-text-secondary)]">
        {t({ id: "transcriptions.list.empty.hold", message: "Hold" })}{" "}
        <span className="inline-flex gap-1" aria-hidden="true">
          {shortcutKeys.map((key) => (
            <kbd
              key={key}
              className="rounded-md bg-[var(--color-bg-primary)] px-1.5 py-0.5 ui-text-micro font-medium text-[var(--color-text-primary)]"
            >
              {key}
            </kbd>
          ))}
        </span>{" "}
        {t({
          id: "transcriptions.list.empty.dictate.detail",
          message: "in any app and speak.",
        })}{" "}
        {t({
          id: "transcriptions.list.empty",
          message:
            "What you say lands where your cursor is, and shows up here so you can recover it later.",
        })}
      </p>
      {onOpenShortcutSettings ? (
        <button
          className="mt-[5px] flex h-10 items-center rounded-xl bg-[var(--color-accent)] px-[15px] ui-text-button font-semibold text-white transition-[background-color,transform] hover:bg-[var(--color-accent-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          onClick={onOpenShortcutSettings}
          type="button"
        >
          {t({
            id: "transcriptions.list.empty.shortcut_action",
            message: "See the shortcut",
          })}
        </button>
      ) : null}
    </section>
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

function LoadingTranscriptions({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "flex flex-col gap-2.5 rounded-xl border border-border-primary bg-surface-surface p-3 pointer-events-none"
          : "absolute inset-0 z-20 flex flex-col gap-3 pt-4 pr-3 pointer-events-none"
      }
      aria-hidden="true"
    >
      {(compact ? [0, 1] : [0, 1, 2]).map((row) => (
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
  compact?: boolean;
  state: TranscriptionListViewState;
  shortcutKeys: string[];
  entries: TranscriptionListEntry[];
  computeItemKey: VirtualListProps["computeItemKey"];
  renderEntry: VirtualListProps["itemContent"];
  onOpenShortcutSettings?: () => void;
}) {
  if (props.compact && props.state.kind === "list" && props.state.loading) {
    return <LoadingTranscriptions compact />;
  }

  // El historial global puede tener entradas aunque el filtro de la home no
  // encuentre ninguna de hoy. Virtuoso entonces renderiza sólo sus fades; la
  // superficie diaria debe comunicar el estado vacío, no dos franjas grises.
  if (props.compact && props.entries.length === 0) {
    return (
      <div className="shrink-0">
        <EmptyTranscriptions
          shortcutKeys={props.shortcutKeys}
          onOpenShortcutSettings={props.onOpenShortcutSettings}
        />
      </div>
    );
  }

  return (
    <div
      className={
        props.compact
          ? "relative h-[14rem] shrink-0 overflow-hidden"
          : "relative flex-1 min-h-0 overflow-hidden"
      }
    >
      {!props.compact ? (
        <>
          <div
            className="pointer-events-none absolute left-0 right-3 top-0 h-6 z-10"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-bg-tertiary), transparent)",
            }}
            aria-hidden="true"
            data-testid="transcription-scroll-fade-top"
          />
          <div
            className="pointer-events-none absolute left-0 right-3 bottom-0 h-8 z-10"
            style={{
              background:
                "linear-gradient(to top, var(--color-bg-tertiary), transparent)",
            }}
            aria-hidden="true"
            data-testid="transcription-scroll-fade-bottom"
          />
        </>
      ) : null}
      {props.state.kind === "empty" ? (
        <EmptyTranscriptions
          shortcutKeys={props.shortcutKeys}
          onOpenShortcutSettings={props.onOpenShortcutSettings}
        />
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
