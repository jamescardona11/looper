import { useLingui as useEntryTranslations } from "@lingui/react/macro";
import { motion as Animated } from "framer-motion";
import type { TranscriptionListEntry } from "../transcription-list-policy";
import TranscriptionItem from "./TranscriptionItem";

export function TranscriptionListRow(props: {
  index: number;
  entry: TranscriptionListEntry;
  pendingDeletionIds: ReadonlySet<string>;
  freshIds: ReadonlySet<string>;
  poofingIds: ReadonlySet<string>;
  retryingIds: ReadonlySet<string>;
  todayOnly: boolean;
  reduceMotion: boolean | null;
  showLlmButtons: boolean;
  shiftHeld: boolean;
  showDate: boolean;
  entryClassName: (fresh: boolean, poofing: boolean) => string;
  onDelete: (id: string) => Promise<void>;
  onRestore: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
  onCancelRetry: (id: string) => Promise<void>;
  onRetryCleanup: (id: string) => Promise<void>;
  onUndoCleanup: (id: string) => Promise<void>;
}) {
  const { t } = useEntryTranslations();
  if (props.entry.type === "header") {
    return (
      <div className="transcription-entry flex items-center gap-3 pt-6 pb-2 px-1 first:pt-1">
        <span className="ui-text-body-sm-strong ui-color-secondary shrink-0">
          {props.entry.label}
        </span>
        <div className="ui-divider-trailing flex-1" aria-hidden="true" />
      </div>
    );
  }
  const record = props.entry.record;
  if (props.pendingDeletionIds.has(record.id)) {
    return (
      <div
        className="transcription-entry flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border-primary bg-surface-surface px-4 py-3"
        role="status"
      >
        <span className="ui-text-body-sm ui-color-secondary">
          {t({
            id: "transcriptions.item.deleted",
            message: "Dictation deleted",
          })}
        </span>
        <button
          type="button"
          autoFocus
          onClick={() => props.onRestore(record.id)}
          className="min-h-10 rounded-lg px-3 ui-text-body-sm-strong ui-color-cloud transition-[background-color,color] hover:bg-[var(--color-cloud-10)] hover:text-cloud-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-cloud-30)]"
        >
          {t({ id: "common.undo", message: "Undo" })}
        </button>
      </div>
    );
  }
  return (
    <Animated.div
      className={props.entryClassName(
        props.freshIds.has(record.id),
        props.poofingIds.has(record.id),
      )}
      data-transcription-entry-id={record.id}
      tabIndex={-1}
      initial={
        props.todayOnly && !props.reduceMotion ? { opacity: 0, y: 8 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: props.todayOnly ? 0.32 : 0,
        delay: props.todayOnly ? Math.min(props.index, 8) * 0.04 : 0,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <TranscriptionItem
        record={record}
        isRetrying={props.retryingIds.has(record.id)}
        onDelete={props.onDelete}
        onRetry={props.onRetry}
        onCancelRetry={props.onCancelRetry}
        onRetryLlm={props.onRetryCleanup}
        onUndoLlm={props.onUndoCleanup}
        showLlmButtons={props.showLlmButtons}
        shiftHeld={props.shiftHeld}
        showDate={props.showDate}
      />
    </Animated.div>
  );
}
