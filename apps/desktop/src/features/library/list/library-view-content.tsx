import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { showLibraryToast } from "../../../data/library";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";
import { useModelDownloadEvents } from "../../../shared/hooks/useModelDownloadEvents";
import { useShiftHeld } from "../../../shared/hooks/useShiftHeld";
import type { LibraryItem, LibraryItemPatch } from "../../../contracts";
import {
  modelKeys as settingsModelKeys,
  useSpeechModels,
} from "../../settings/models/models-queries";
import { useSettings } from "../../settings/preferences/queries";
import {
  libraryKeys,
  useCancelLibraryTranscription,
  useCreateLibraryItem,
  useResumeCapture,
  useCreateLibraryYoutubeItem,
  useDeleteLibraryItem,
  useExportLibraryItem,
  useLibraryItems,
  useLibraryTags,
  useMeetingCapture,
  useRetryLibraryTranscription,
  useStartMeetingCapture,
  useStartVoiceNoteCapture,
  useUpdateLibraryItem,
} from "../queries";
import { groupLibraryItemsByRecency } from "./library-inbox-groups";
import {
  formatDeleteErrorMessage,
  SUPPORTED_EXTENSIONS,
  uniquePaths,
} from "../shared/library-utils";
import { meetingCaptureBlocksStart } from "../meeting/meeting-capture-visibility";
import { LibraryViewDetail } from "./library-view-detail";
import { LibraryViewList } from "./library-view-list";
import {
  appendTagPatch,
  displayedStatusChoice,
  editNamePatch,
  libraryErrorMessage,
  libraryFilter,
  libraryItemsFromPages,
  nextStatusFilter,
  removeTagPatch,
  selectedLibraryItem,
  selectLibraryModels,
} from "./library-view-model";
import { LibraryViewOverlays } from "./library-view-overlays";
import { LibraryViewToolbar } from "./library-view-toolbar";
export type LibraryViewContentProps = {
  pendingImportPaths: string[] | null;
  onSetImportPaths: (paths: string[] | null) => void;
  onOpenImportRoute?: () => void;
  onDetailVisibilityChange?: (visible: boolean) => void;
  isActive: boolean;
  focusItem?: { id: string; query: string } | null;
  "data-notification-position": string;
};

export default function LibraryViewContent({
  pendingImportPaths,
  onSetImportPaths,
  onOpenImportRoute,
  onDetailVisibilityChange,
  isActive,
  focusItem = null,
  "data-notification-position": notificationPosition,
}: LibraryViewContentProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [nameEditor, setNameEditor] = useState({
    id: null as string | null,
    draft: "",
  });
  const [tagEditor, setTagEditor] = useState({
    id: null as string | null,
    draft: "",
  });
  const [followTimestamps, setFollowTimestamps] = useState(true);
  const [youtubeImportOpen, setYoutubeImportOpen] = useState(false);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const lastFocusItemId = useRef<string | null>(null);
  const openedFocusItemId = useRef<string | null>(null);
  const focusSearchQuery = useRef<string | null>(null);
  const shiftHeld = useShiftHeld(isActive);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const filter = useMemo(
    () => libraryFilter(debouncedSearch, statusFilter),
    [debouncedSearch, statusFilter],
  );
  const itemsQuery = useLibraryItems(filter, isActive);
  const items = useMemo(
    () => libraryItemsFromPages(itemsQuery.data?.pages),
    [itemsQuery.data],
  );

  const selectedItem = useMemo(
    () => selectedLibraryItem(items, selectedItemId),
    [items, selectedItemId],
  );
  useEffect(() => {
    onDetailVisibilityChange?.(selectedItem != null);
  }, [onDetailVisibilityChange, selectedItem]);
  const inboxGroups = useMemo(() => groupLibraryItemsByRecency(items), [items]);
  useEffect(() => {
    if (!focusItem || lastFocusItemId.current === focusItem.id) return;
    lastFocusItemId.current = focusItem.id;
    focusSearchQuery.current = focusItem.query;
    setSearchQuery(focusItem.query);
  }, [focusItem]);
  // Abrir el elemento enfocado una sola vez: si se reabriera en cada refetch,
  // cerrar el detalle sería imposible mientras hubiera una captura en curso.
  useEffect(() => {
    if (!focusItem || openedFocusItemId.current === focusItem.id) return;
    if (!items.some(({ id }) => id === focusItem.id)) return;
    openedFocusItemId.current = focusItem.id;
    setSelectedItemId(focusItem.id);
  }, [focusItem, items]);
  const { data: availableTags = [] } = useLibraryTags(isActive);
  const { data: speechModels = [] } = useSpeechModels(isActive);
  const { data: defaultModelKey = "" } = useSettings(
    (settings) => settings.local_model,
    isActive,
  );
  const models = useMemo(
    () => selectLibraryModels(speechModels, defaultModelKey),
    [defaultModelKey, speechModels],
  );

  // El buscador solo llevaba el título con el que se abrió el detalle; si se
  // queda puesto al cerrarlo, la lista sigue filtrada y las grabaciones nuevas
  // desaparecen tras un filtro que nadie escribió.
  const closeDetail = useCallback(() => {
    const focusQuery = focusSearchQuery.current;
    focusSearchQuery.current = null;
    setSelectedItemId(null);
    setSearchQuery((current) => (current === focusQuery ? "" : current));
  }, []);

  const createItem = useCreateLibraryItem();
  const createYoutubeItem = useCreateLibraryYoutubeItem();
  const updateItem = useUpdateLibraryItem();
  const deleteItem = useDeleteLibraryItem();
  const cancelTranscription = useCancelLibraryTranscription();
  const retryTranscription = useRetryLibraryTranscription();
  const exportItem = useExportLibraryItem();
  const { data: meetingCapture } = useMeetingCapture(isActive);
  const resumeCapture = useResumeCapture();
  const startMeeting = useStartMeetingCapture();
  const startNote = useStartVoiceNoteCapture();

  const invalidateTags = useCallback(
    () => queryClient.invalidateQueries({ queryKey: libraryKeys.tags() }),
    [queryClient],
  );
  const updateWithTags = useCallback(
    async (id: string, patch: LibraryItemPatch) => {
      const updated = await updateItem.mutateAsync({ id, patch });
      if (patch.tags != null) void invalidateTags();
      return updated;
    },
    [invalidateTags, updateItem],
  );
  const deleteWithToast = useCallback(
    async (id: string) => {
      try {
        await deleteItem.mutateAsync(id);
        void invalidateTags();
      } catch (error) {
        console.error("Failed to delete library item:", error);
        void showLibraryToast(
          "error",
          formatDeleteErrorMessage(
            error instanceof Error ? error.message : String(error),
          ),
        ).catch(() => {});
      }
    },
    [deleteItem, invalidateTags],
  );
  const refreshSpeechModels = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: settingsModelKeys.speech(),
    });
  }, [queryClient]);
  useModelDownloadEvents({
    enabled: isActive,
    onComplete: refreshSpeechModels,
    onError: refreshSpeechModels,
  });

  const openImportPicker = async () => {
    try {
      const selection = await open({
        multiple: true,
        filters: [
          {
            name: t({
              id: "library.view.file_filter",
              message: "Audio & Video",
            }),
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selection) return;
      const paths = Array.isArray(selection) ? selection : [selection];
      if (paths.length > 0) onSetImportPaths(uniquePaths(paths));
    } catch (error) {
      console.error("Failed to open import dialog:", error);
      void showLibraryToast(
        "error",
        t({
          id: "library.view.import_dialog_error",
          message: "Could not open the import dialog.",
        }),
      ).catch(() => {});
    }
  };

  const openImport = () => {
    if (onOpenImportRoute) {
      onOpenImportRoute();
      return;
    }

    void openImportPicker();
  };

  const commitNameEdit = async (item: LibraryItem) => {
    const patch = editNamePatch(items, item.id, nameEditor.draft);
    setNameEditor({ id: null, draft: "" });
    if (patch) await updateWithTags(item.id, patch);
  };
  const commitTagEdit = async (item: LibraryItem, override?: string) => {
    const nextTag = (override ?? tagEditor.draft).trim();
    if (!nextTag) {
      setTagEditor({ id: null, draft: "" });
      return;
    }
    if (!items.some(({ id }) => id === item.id)) return;
    const patch = appendTagPatch(items, item.id, nextTag);
    if (!patch) {
      setTagEditor({ id: null, draft: "" });
      return;
    }
    await updateWithTags(item.id, patch);
    setTagEditor({ id: null, draft: "" });
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {selectedItem ? (
        <LibraryViewDetail
          item={selectedItem}
          models={models.installed}
          shiftHeld={shiftHeld}
          followTimestamps={followTimestamps}
          onFollowTimestampsChange={setFollowTimestamps}
          onClose={closeDetail}
          onDelete={async () => {
            await deleteWithToast(selectedItem.id);
            closeDetail();
          }}
          onContinueRecording={() => resumeCapture.mutate(selectedItem.id)}
          onRetry={() => retryTranscription.mutateAsync(selectedItem.id)}
          onCancel={() => cancelTranscription.mutateAsync(selectedItem.id)}
          onUpdate={(patch) => updateWithTags(selectedItem.id, patch)}
          onExport={(format, outputPath) =>
            exportItem.mutateAsync({ id: selectedItem.id, format, outputPath })
          }
          availableTags={availableTags}
        />
      ) : (
        <>
          <LibraryViewToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onStartNote={() => {
              void startNote.mutateAsync().catch((error) => {
                void showLibraryToast(
                  "error",
                  error instanceof Error ? error.message : String(error),
                ).catch(() => {});
              });
            }}
            noteDisabled={
              startNote.isPending ||
              Boolean(
                meetingCapture &&
                meetingCaptureBlocksStart(meetingCapture.phase),
              )
            }
            onOpenMeeting={() => setMeetingModalOpen(true)}
            meetingDisabled={Boolean(
              startNote.isPending ||
              (meetingCapture &&
                meetingCaptureBlocksStart(meetingCapture.phase)),
            )}
            onOpenImport={openImport}
            onOpenYoutube={() => setYoutubeImportOpen(true)}
            youtubeDisabled={!models.detailDefault}
            error={libraryErrorMessage(itemsQuery.error)}
            notificationPosition={notificationPosition}
          />
          <LibraryViewList
            items={items}
            groups={inboxGroups}
            status={displayedStatusChoice(statusFilter)}
            onStatusChange={(choice) =>
              setStatusFilter((current) =>
                choice === "all" ? "all" : nextStatusFilter(current, choice),
              )
            }
            loading={itemsQuery.isLoading}
            fetchingNextPage={itemsQuery.isFetchingNextPage}
            hasNextPage={Boolean(itemsQuery.hasNextPage)}
            onFetchNextPage={() => void itemsQuery.fetchNextPage()}
            onOpenImport={openImport}
            nameEditor={{
              ...nameEditor,
              start: (item) => setNameEditor({ id: item.id, draft: item.name }),
              change: (draft) =>
                setNameEditor((editor) => ({ ...editor, draft })),
              commit: (item) => void commitNameEdit(item),
              cancel: () => setNameEditor({ id: null, draft: "" }),
            }}
            tagEditor={{
              ...tagEditor,
              start: (item) => setTagEditor({ id: item.id, draft: "" }),
              change: (draft) =>
                setTagEditor((editor) => ({ ...editor, draft })),
              commit: (item, value) => void commitTagEdit(item, value),
              cancel: () => setTagEditor({ id: null, draft: "" }),
            }}
            actions={{
              open: (item) => setSelectedItemId(item.id),
              removeTag: async (item, tag) => {
                await updateWithTags(item.id, removeTagPatch(item, tag));
              },
              clickTag: (tag) => setSearchQuery(`#${tag}`),
              retry: (item) => retryTranscription.mutateAsync(item.id),
              cancel: (item) => cancelTranscription.mutateAsync(item.id),
              delete: (item) => deleteWithToast(item.id),
            }}
            shiftHeld={shiftHeld}
            availableTags={availableTags}
          />
        </>
      )}

      <LibraryViewOverlays
        youtubeOpen={youtubeImportOpen}
        onCloseYoutube={() => setYoutubeImportOpen(false)}
        onCreateYoutube={(metadata, options) =>
          createYoutubeItem.mutateAsync({ metadata, options })
        }
        pendingImportPaths={pendingImportPaths}
        onSetImportPaths={onSetImportPaths}
        onCreateFile={(path, options) =>
          createItem.mutateAsync({ path, options })
        }
        installedModels={models.installed}
        defaultSpeechModelKey={models.detailDefault}
        defaultImportModelKey={models.importDefault}
        meetingOpen={meetingModalOpen}
        meetingModels={models.meeting}
        liveMeetingModels={models.liveMeeting}
        defaultMeetingModelKey={models.meetingDefault}
        meetingPending={startMeeting.isPending}
        meetingError={libraryErrorMessage(startMeeting.error)}
        onCancelMeeting={() => {
          if (!startMeeting.isPending) {
            startMeeting.reset();
            setMeetingModalOpen(false);
          }
        }}
        onStartMeeting={async (options) => {
          const result = await startMeeting.mutateAsync(options);
          setMeetingModalOpen(false);
          return result;
        }}
      />
    </div>
  );
}
