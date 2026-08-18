import { useLingui as useListTranslations } from "@lingui/react/macro";
import { motion as Animated, useReducedMotion } from "framer-motion";
import { memo, useCallback, useMemo, useState } from "react";
import { useSettings } from "../../settings/queries";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";
import { useShiftHeld } from "../../../shared/hooks/useShiftHeld";
import { formatShortcutForDisplay } from "../../../shared/lib/shortcuts";
import { currentTimePreset, parseTranscriptionSearch } from "../searchQuery";
import {
  buildTranscriptionListEntries,
  transcriptionEntryClassName,
  transcriptionGroupLabel,
  transcriptionListViewState,
  visibleTranscriptions,
  type TranscriptionListEntry,
} from "../transcription-list-policy";
import {
  useDeleteTranscription,
  useRetryLlmCleanup,
  useRetryTranscription,
  useTranscriptionList,
  useUndoLlmCleanup,
} from "../queries";
import { useDeferredDeletion } from "../useDeferredDeletion";
import { TranscriptionListRow } from "./transcription-list-entry";
import {
  FreshAnimationExpiry,
  transcriptionDataKey,
  useFreshTranscriptionIds,
} from "./transcription-list-lifecycle";
import { TranscriptionListSearchControls } from "./transcription-list-search-controls";
import { TranscriptionListViewport } from "./transcription-list-viewport";

interface TranscriptionListProps {
  showLlmButtons?: boolean;
  isActive?: boolean;
  focusRecordId?: string | null;
  /** Home solo muestra el ahora; el archivo completo vive en Memory. */
  todayOnly?: boolean;
}

// Coincide con la animación looper-poof-out de app/animations.css.
const POOF_DURATION_MS = 220;
const DELETE_UNDO_MS = 8_000;

const entryKey = (_index: number, entry: TranscriptionListEntry): string =>
  entry.type === "header" ? entry.id : entry.record.id;

function TranscriptionList({
  showLlmButtons = false,
  isActive = true,
  focusRecordId = null,
  todayOnly = false,
}: TranscriptionListProps) {
  const { t } = useListTranslations();
  const { data: smartShortcut } = useSettings(
    (settings) => settings.smart_shortcut,
  );
  const shortcutKeys = formatShortcutForDisplay(smartShortcut ?? "Fn").split(
    " + ",
  );
  const reducedMotion = useReducedMotion();
  const shiftHeld = useShiftHeld(isActive);
  const [query, setQuery] = useState("");
  const delayedQuery = useDebouncedValue(query, 300);
  const parsedQuery = useMemo(() => parseTranscriptionSearch(query), [query]);
  const delayedText = useMemo(
    () => parseTranscriptionSearch(delayedQuery).text,
    [delayedQuery],
  );

  const {
    data: transcriptions = [],
    isLoading,
    isFetched,
  } = useTranscriptionList(isActive);
  const deleteMutation = useDeleteTranscription();
  const {
    pendingIds: pendingDeletionIds,
    requestDeletion,
    undoDeletion,
  } = useDeferredDeletion(deleteMutation.mutateAsync, DELETE_UNDO_MS);
  const {
    retry: retryMutation,
    cancelRetry: cancelRetryMutation,
    retryingIds,
  } = useRetryTranscription(isActive);
  const retryCleanupMutation = useRetryLlmCleanup();
  const undoCleanupMutation = useUndoLlmCleanup();
  const retryingIdSet = useMemo(() => new Set(retryingIds), [retryingIds]);
  const freshIds = useFreshTranscriptionIds(transcriptions, isFetched);
  const [poofingIds, setPoofingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const visibleRecords = useMemo(
    () =>
      visibleTranscriptions(transcriptions, {
        todayOnly,
        text: delayedText,
        after: parsedQuery.after,
        before: parsedQuery.before,
        sort: parsedQuery.sort,
        now: new Date(),
      }),
    [
      transcriptions,
      todayOnly,
      delayedText,
      parsedQuery.after,
      parsedQuery.before,
      parsedQuery.sort,
    ],
  );
  const chronologicalSort =
    parsedQuery.sort === "recent" || parsedQuery.sort === "oldest";
  const groupLabelFor = useCallback(
    (date: Date) =>
      transcriptionGroupLabel(date, new Date(), {
        today: t({ id: "transcriptions.group.today", message: "Today" }),
        yesterday: t({
          id: "transcriptions.group.yesterday",
          message: "Yesterday",
        }),
      }),
    [t],
  );
  const entries = useMemo(
    () =>
      buildTranscriptionListEntries(visibleRecords, {
        grouped: chronologicalSort && !todayOnly,
        labelFor: groupLabelFor,
      }),
    [visibleRecords, chronologicalSort, todayOnly, groupLabelFor],
  );

  const deleteTranscription = useCallback(
    async (id: string) => {
      setPoofingIds((current) => new Set(current).add(id));
      try {
        await new Promise((resolve) => setTimeout(resolve, POOF_DURATION_MS));
        requestDeletion(id);
      } finally {
        setPoofingIds((current) => {
          const remaining = new Set(current);
          remaining.delete(id);
          return remaining;
        });
      }
    },
    [requestDeletion],
  );
  const restoreTranscription = useCallback(
    (id: string) => {
      if (!undoDeletion(id)) return;
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-transcription-entry-id="${id}"]`)
          ?.focus();
      });
    },
    [undoDeletion],
  );
  const retryTranscription = useCallback(
    async (id: string) => retryMutation.mutateAsync(id),
    [retryMutation],
  );
  const cancelRetryTranscription = useCallback(
    async (id: string) => cancelRetryMutation.mutateAsync(id),
    [cancelRetryMutation],
  );
  const retryCleanup = useCallback(
    async (id: string) => retryCleanupMutation.mutateAsync(id),
    [retryCleanupMutation],
  );
  const undoCleanup = useCallback(
    async (id: string) => undoCleanupMutation.mutateAsync(id),
    [undoCleanupMutation],
  );
  const renderEntry = useCallback(
    (index: number, entry: TranscriptionListEntry) => (
      <TranscriptionListRow
        index={index}
        entry={entry}
        pendingDeletionIds={pendingDeletionIds}
        freshIds={freshIds}
        poofingIds={poofingIds}
        retryingIds={retryingIdSet}
        todayOnly={todayOnly}
        reduceMotion={reducedMotion}
        showLlmButtons={showLlmButtons}
        shiftHeld={shiftHeld}
        showDate={!chronologicalSort}
        entryClassName={transcriptionEntryClassName}
        onDelete={deleteTranscription}
        onRestore={restoreTranscription}
        onRetry={retryTranscription}
        onCancelRetry={cancelRetryTranscription}
        onRetryCleanup={retryCleanup}
        onUndoCleanup={undoCleanup}
      />
    ),
    [
      pendingDeletionIds,
      freshIds,
      poofingIds,
      retryingIdSet,
      todayOnly,
      reducedMotion,
      showLlmButtons,
      shiftHeld,
      chronologicalSort,
      deleteTranscription,
      restoreTranscription,
      retryTranscription,
      cancelRetryTranscription,
      retryCleanup,
      undoCleanup,
    ],
  );
  const listState = transcriptionListViewState({
    fetched: isFetched,
    loading: isLoading,
    totalCount: transcriptions.length,
    visibleCount: visibleRecords.length,
    query,
    resultText: parsedQuery.text,
  });

  return (
    <Animated.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.25,
        ease: "easeOut",
      }}
      className="w-full flex-1 min-h-0 h-0 flex flex-col"
    >
      <FreshAnimationExpiry
        key={transcriptionDataKey(transcriptions)}
        freshIds={freshIds}
      />
      <TranscriptionListSearchControls
        query={query}
        sort={parsedQuery.sort}
        time={currentTimePreset(parsedQuery.after, parsedQuery.before)}
        records={transcriptions}
        focusRecordId={focusRecordId}
        onQueryChange={setQuery}
      />
      <TranscriptionListViewport
        state={listState}
        shortcutKeys={shortcutKeys}
        entries={entries}
        computeItemKey={entryKey}
        renderEntry={renderEntry}
      />
    </Animated.div>
  );
}

export default memo(TranscriptionList);
