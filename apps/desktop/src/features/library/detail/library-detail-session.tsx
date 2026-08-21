import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { LibraryDetailHeader } from "./LibraryDetailHeader";
import { LibraryDetailModals } from "./LibraryDetailModals";
import { LibraryTranscriptPanel } from "../transcript/LibraryTranscriptPanel";
import { TranscriptSpeakerChip } from "../transcript/TranscriptSpeakerChip";
import { TranscriptWords } from "../transcript/TranscriptWords";
import { LibraryDetailBody } from "./library-detail-body";
import { createLibraryDetailFooter } from "./library-detail-footer";
import { highlightedTranscript } from "./library-detail-highlight";
import {
  LibraryDetailFollowSync,
  LibraryDetailKeyboardBridge,
  LibraryDetailScrollInterruption,
  LibraryDetailSearchSync,
} from "./library-detail-lifecycle";
import { formatLibraryCreatedDate } from "./library-detail-metadata";
import {
  activeSegmentAt,
  activeWordAt,
  alignWordsToSegments,
  availableTagChoices,
  hasUsableTranscript,
  isCaptureItem,
  isLibraryItemBusy,
  speakerColorAt,
  speakerIndex,
  speakersWithPalette,
  timestampNeighbor,
  visibleTranscriptSegments,
} from "./library-detail-policy";
import { createLibraryDetailSearch } from "./library-detail-search";
import {
  fieldSetter,
  initialDetailState,
  synchronizeDetailState,
} from "./library-detail-state";
import type { LibraryDetailProps } from "./library-detail-types";
import { useTranscriptAutosave } from "./library-detail-transcript-autosave";
import {
  clampProgress,
  shouldShowImportProgress,
} from "../shared/library-utils";
import { useLibraryExport } from "../export/useLibraryExport";
import { useLibraryPlayer } from "../player/useLibraryPlayer";
import { resolveSpeechModelLabel } from "../../settings/models-queries";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";
import { useCopyToClipboard } from "../../../shared/hooks/useCopyToClipboard";
import type {
  LibraryItemPatch,
  Speaker,
  TranscriptSegment,
} from "../../../types";

export function LibraryDetailSession(props: LibraryDetailProps) {
  const { item } = props;
  const { t } = useLingui();
  const [storedState, setStoredState] = useState(() =>
    initialDetailState(item),
  );
  const state = synchronizeDetailState(storedState, item);
  if (state !== storedState) setStoredState(state);

  const setNameDraft = fieldSetter(setStoredState, "nameDraft");
  const setIsEditingName = fieldSetter(setStoredState, "isEditingName");
  const setTagInput = fieldSetter(setStoredState, "tagInput");
  const setTagMenuOpen = fieldSetter(setStoredState, "tagMenuOpen");
  const setShowTimestamps = fieldSetter(setStoredState, "showTimestamps");
  const setExportOpen = fieldSetter(setStoredState, "exportOpen");
  const setOverflowOpen = fieldSetter(setStoredState, "overflowOpen");
  const setShowDeleteConfirm = fieldSetter(setStoredState, "showDeleteConfirm");
  const setShowRetranscribe = fieldSetter(setStoredState, "showRetranscribe");
  const setShowTranslations = fieldSetter(setStoredState, "showTranslations");
  const setSearchQuery = fieldSetter(setStoredState, "searchQuery");
  const setActiveSearchIndex = fieldSetter(setStoredState, "activeSearchIndex");
  const setRenamingSpeakerId = fieldSetter(setStoredState, "renamingSpeakerId");
  const setSpeakerNameDraft = fieldSetter(setStoredState, "speakerNameDraft");
  const setSpeakerMenuSegment = fieldSetter(
    setStoredState,
    "speakerMenuSegment",
  );
  const setSpeakersMenuOpen = fieldSetter(setStoredState, "speakersMenuOpen");
  const setSpeakerFilter = fieldSetter(setStoredState, "speakerFilter");
  const setFilterMenuOpen = fieldSetter(setStoredState, "filterMenuOpen");
  const setMeetingView = fieldSetter(setStoredState, "meetingView");

  const refs = {
    tagMenu: useRef<HTMLDivElement>(null),
    exportMenu: useRef<HTMLDivElement>(null),
    overflowMenu: useRef<HTMLDivElement>(null),
    speakerMenu: useRef<HTMLDivElement>(null),
    speakersMenu: useRef<HTMLDivElement>(null),
    filterMenu: useRef<HTMLDivElement>(null),
    lastTimestampNavigation: useRef(0),
    transcriptArea: useRef<HTMLTextAreaElement>(null),
    segmentsVirtuoso: useRef<VirtuosoHandle>(null),
    streamVirtuoso: useRef<VirtuosoHandle>(null),
    segmentsScroller: useRef<HTMLElement>(null),
    followAnimation: useRef<number | null>(null),
  };
  const transcriptAvailable = hasUsableTranscript(item);
  const canShowTimestamps = Boolean(item.segments?.length);
  const showSegmentView = state.showTimestamps && canShowTimestamps;
  const showStreaming =
    item.status.type === "transcribing" && !state.showTimestamps;
  const followTimestampsActive = props.followTimestamps && showSegmentView;
  const speakers = useMemo(() => speakersWithPalette(item), [item]);
  const speakerById = useMemo(() => speakerIndex(speakers), [speakers]);
  const visibleSegments = useMemo(
    () => visibleTranscriptSegments(item.segments, state.speakerFilter),
    [item.segments, state.speakerFilter],
  );
  const modelLabel =
    resolveSpeechModelLabel(props.models, item.speech_model) ??
    item.speech_model;
  const createdAtLabel = formatLibraryCreatedDate(item.created_at);
  const isBusy = isLibraryItemBusy(item);
  const importStatusText =
    item.status.type === "recording"
      ? t({ id: "meeting.detail.recording", message: "Recording meeting..." })
      : item.status.type === "importing"
        ? shouldShowImportProgress(item.status.progress)
          ? t({
              id: "library.modal.import_status.converting_progress",
              message: `Converting audio... ${Math.round(clampProgress(item.status.progress) * 100)}%`,
            })
          : t({
              id: "library.modal.import_status.converting",
              message: "Converting audio...",
            })
        : t({
            id: "library.modal.import_status.queued",
            message: "Queued for transcription...",
          });

  const player = useLibraryPlayer({
    audioPath: item.audio_path,
    durationSeconds: item.duration_seconds || 0,
  });
  const { copied: copyConfirmed, copy: copyTranscript } =
    useCopyToClipboard(1400);
  const { isExporting, handleExport } = useLibraryExport({
    itemName: item.name,
    onExport: props.onExport,
    onComplete: () => setExportOpen(false),
  });

  const transcriptDraft = useTranscriptAutosave({
    source: item.transcript ?? "",
    value: state.transcriptDraft,
    available: transcriptAvailable,
    onUpdate: props.onUpdate,
    setValue: fieldSetter(setStoredState, "transcriptDraft"),
  });

  useClickOutside(refs.tagMenu, () => setTagMenuOpen(false), state.tagMenuOpen);
  useClickOutside(
    refs.exportMenu,
    () => setExportOpen(false),
    state.exportOpen,
  );
  useClickOutside(
    refs.overflowMenu,
    () => setOverflowOpen(false),
    state.overflowOpen,
  );
  useClickOutside(
    refs.speakerMenu,
    () => setSpeakerMenuSegment(null),
    state.speakerMenuSegment !== null,
  );
  useClickOutside(
    refs.speakersMenu,
    () => {
      setSpeakersMenuOpen(false);
      setRenamingSpeakerId(null);
      setSpeakerNameDraft("");
    },
    state.speakersMenuOpen,
  );
  useClickOutside(
    refs.filterMenu,
    () => setFilterMenuOpen(false),
    state.filterMenuOpen,
  );

  const handleNameCommit = async () => {
    const name = state.nameDraft.trim();
    if (!name || name === item.name) {
      setNameDraft(item.name);
      setIsEditingName(false);
      return;
    }
    await props.onUpdate({ name });
    setIsEditingName(false);
  };
  const handleAddTag = async (requested?: string) => {
    const tag = (requested ?? state.tagInput).trim();
    if (!tag) return;
    if (item.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
      setTagInput("");
      return;
    }
    await props.onUpdate({ tags: [...item.tags, tag] });
    setTagInput("");
  };
  const handleRemoveTag = (tag: string) =>
    props
      .onUpdate({ tags: item.tags.filter((entry) => entry !== tag) })
      .then(() => undefined);
  const handleAddSpeaker = async () => {
    const position = speakers.length;
    const nextIndex = position + 1;
    const speaker: Speaker = {
      id: crypto.randomUUID(),
      name: t({
        id: "library.detail.speaker_default_name",
        message: `Speaker ${nextIndex}`,
      }),
      color: speakerColorAt(position),
    };
    await props.onUpdate({ speakers: [...speakers, speaker] });
    return speaker;
  };
  const handleRenameSpeaker = async (speakerId: string) => {
    const name = state.speakerNameDraft.trim();
    setRenamingSpeakerId(null);
    setSpeakerNameDraft("");
    if (!name) return;
    await props.onUpdate({
      speakers: speakers.map((speaker) =>
        speaker.id === speakerId ? { ...speaker, name } : speaker,
      ),
    });
  };
  const handleRemoveSpeaker = async (speakerId: string) => {
    if (state.speakerFilter === speakerId) setSpeakerFilter(null);
    const patch: LibraryItemPatch = {
      speakers: speakers.filter((speaker) => speaker.id !== speakerId),
    };
    if (item.segments?.some((segment) => segment.speaker_id === speakerId)) {
      patch.segments = item.segments.map((segment) =>
        segment.speaker_id === speakerId
          ? { ...segment, speaker_id: null }
          : segment,
      );
    }
    await props.onUpdate(patch);
  };
  const handleAssignSpeaker = async (
    segmentIndex: number,
    speakerId: string | null,
  ) => {
    setSpeakerMenuSegment(null);
    if (!item.segments?.[segmentIndex]) return;
    await props.onUpdate({
      segments: item.segments.map((segment, index) =>
        index === segmentIndex
          ? { ...segment, speaker_id: speakerId }
          : segment,
      ),
    });
  };

  const filteredTagOptions = availableTagChoices(
    item.tags,
    props.availableTags,
    state.tagInput,
  );
  const search = createLibraryDetailSearch({
    transcriptDraft: state.transcriptDraft,
    streamChunks: state.streamChunks,
    visibleSegments,
    showSegmentView,
    showStreaming,
    query: state.searchQuery,
    activeIndex: state.activeSearchIndex,
    setQuery: setSearchQuery,
    setActiveIndex: setActiveSearchIndex,
  });
  const wordStarts = useMemo(
    () => alignWordsToSegments(item.segments, item.words),
    [item.segments, item.words],
  );
  const activeSegment = showSegmentView
    ? activeSegmentAt(player.audioCurrentTime, item.segments)
    : -1;
  const activeWord = useMemo(
    () =>
      showSegmentView
        ? activeWordAt({
            seconds: player.audioCurrentTime,
            activeSegment,
            segments: item.segments,
            words: item.words,
            wordStarts,
          })
        : -1,
    [
      activeSegment,
      item.segments,
      item.words,
      player.audioCurrentTime,
      showSegmentView,
      wordStarts,
    ],
  );
  const renderSegmentWords = useCallback(
    (segment: TranscriptSegment, index: number) => {
      const first = wordStarts?.[index];
      if (first == null) return null;
      const tokens = segment.text.trim().split(/\s+/).filter(Boolean);
      const active =
        activeWord >= first && activeWord < first + tokens.length
          ? activeWord - first
          : -1;
      return <TranscriptWords tokens={tokens} activePosition={active} />;
    },
    [activeWord, wordStarts],
  );
  const renderHighlightedText = useCallback(
    (text: string, active: boolean): ReactNode =>
      highlightedTranscript(text, search.query, active),
    [search.query],
  );
  const renderSpeakerChip = (segment: TranscriptSegment, index: number) => (
    <TranscriptSpeakerChip
      variant={item.kind === "meeting" ? "label" : "dot"}
      segment={segment}
      index={index}
      speakers={speakers}
      speakerById={speakerById}
      openIndex={state.speakerMenuSegment}
      setOpenIndex={setSpeakerMenuSegment}
      menuRef={refs.speakerMenu}
      onAssign={handleAssignSpeaker}
      onAddSpeaker={handleAddSpeaker}
    />
  );

  const handleTimestampStep = useCallback(
    (direction: number) => {
      if (!showSegmentView || !visibleSegments.length) return;
      const next = timestampNeighbor(visibleSegments, activeSegment, direction);
      const current = visibleSegments.findIndex(
        ({ index }) => index === activeSegment,
      );
      if (next !== current) {
        player.handleTimestampClick(visibleSegments[next].segment.start_ms);
      }
    },
    [activeSegment, player, showSegmentView, visibleSegments],
  );
  const stopFollowScroll = useCallback(() => {
    if (refs.followAnimation.current === null) return;
    cancelAnimationFrame(refs.followAnimation.current);
    refs.followAnimation.current = null;
  }, [refs.followAnimation]);
  const scrollToFollowTarget = useCallback(
    (target: number) => {
      const scroller = refs.segmentsScroller.current;
      if (!scroller) return;
      stopFollowScroll();
      const origin = scroller.scrollTop;
      const distance = target - origin;
      if (Math.abs(distance) < 1) return;
      const duration = Math.min(900, Math.max(450, Math.abs(distance) * 6));
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        scroller.scrollTop = origin + distance * eased;
        refs.followAnimation.current =
          progress < 1 ? requestAnimationFrame(tick) : null;
      };
      refs.followAnimation.current = requestAnimationFrame(tick);
    },
    [refs.followAnimation, refs.segmentsScroller, stopFollowScroll],
  );
  const visibleActivePosition = visibleSegments.findIndex(
    ({ index }) => index === activeSegment,
  );

  const transcriptPanel = (
    <LibraryTranscriptPanel
      documentMode={isCaptureItem(item)}
      item={item}
      showSegmentView={showSegmentView}
      visibleSegments={visibleSegments}
      segmentsVirtuosoRef={refs.segmentsVirtuoso}
      segmentsScrollerRef={refs.segmentsScroller}
      activeSegmentIndex={activeSegment}
      normalizedSearchQuery={search.query}
      renderSegmentWords={renderSegmentWords}
      renderHighlightedText={renderHighlightedText}
      activeSegmentMatch={search.activeSegmentMatch}
      renderSpeakerChip={renderSpeakerChip}
      handleTimestampClick={player.handleTimestampClick}
      showStreaming={showStreaming}
      streamChunks={state.streamChunks}
      streamVirtuosoRef={refs.streamVirtuoso}
      activeStreamMatch={search.activeStreamMatch}
      importStatusText={importStatusText}
      transcriptAreaRef={refs.transcriptArea}
      transcriptDraft={state.transcriptDraft}
      setTranscriptDraft={transcriptDraft}
      transcriptAvailable={transcriptAvailable}
    />
  );

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      <LibraryDetailHeader
        {...props}
        nameDraft={state.nameDraft}
        isEditingName={state.isEditingName}
        setNameDraft={setNameDraft}
        setIsEditingName={setIsEditingName}
        handleNameCommit={handleNameCommit}
        searchQuery={state.searchQuery}
        handleSearchChange={search.change}
        handleSearchNavigate={search.navigate}
        searchMatchLabel={search.label}
        filterMenuRef={refs.filterMenu}
        filterMenuOpen={state.filterMenuOpen}
        setFilterMenuOpen={setFilterMenuOpen}
        speakerFilter={state.speakerFilter}
        setSpeakerFilter={setSpeakerFilter}
        speakers={speakers}
        transcriptAvailable={transcriptAvailable}
        copyConfirmed={copyConfirmed}
        handleCopy={() => {
          if (state.transcriptDraft.trim())
            copyTranscript(state.transcriptDraft);
        }}
        exportMenuRef={refs.exportMenu}
        exportOpen={state.exportOpen}
        setExportOpen={setExportOpen}
        isExporting={isExporting}
        handleExport={handleExport}
        overflowMenuRef={refs.overflowMenu}
        overflowOpen={state.overflowOpen}
        setOverflowOpen={setOverflowOpen}
        setShowTranslations={setShowTranslations}
        setShowRetranscribe={setShowRetranscribe}
        isBusy={isBusy}
        setShowDeleteConfirm={setShowDeleteConfirm}
        modelLabel={modelLabel}
        createdAtLabel={createdAtLabel}
        audioDuration={player.audioDuration}
        tagMenuRef={refs.tagMenu}
        tagMenuOpen={state.tagMenuOpen}
        setTagMenuOpen={setTagMenuOpen}
        tagInput={state.tagInput}
        setTagInput={setTagInput}
        handleAddTag={handleAddTag}
        handleRemoveTag={handleRemoveTag}
        filteredTagOptions={filteredTagOptions}
        availableTags={props.availableTags}
        speakersMenuRef={refs.speakersMenu}
        speakersMenuOpen={state.speakersMenuOpen}
        setSpeakersMenuOpen={setSpeakersMenuOpen}
        renamingSpeakerId={state.renamingSpeakerId}
        setRenamingSpeakerId={setRenamingSpeakerId}
        speakerNameDraft={state.speakerNameDraft}
        setSpeakerNameDraft={setSpeakerNameDraft}
        handleRenameSpeaker={handleRenameSpeaker}
        handleRemoveSpeaker={handleRemoveSpeaker}
        handleAddSpeaker={handleAddSpeaker}
      />
      <LibraryDetailBody
        meeting={isCaptureItem(item)}
        transcriptPanel={transcriptPanel}
        workspace={{
          id: item.id,
          title: state.nameDraft,
          createdAtLabel,
          durationSeconds: player.audioDuration,
          modelLabel,
          tags: item.tags,
          speakerCount: speakers.length,
          view: state.meetingView,
          onViewChange: setMeetingView,
          segments: item.segments,
          audioAvailable: player.audioReady && player.audioError == null,
          onPlayNote: player.handleTimestampClick,
        }}
        footer={createLibraryDetailFooter({
          item,
          player,
          meetingView: state.meetingView,
          setMeetingView,
          canShowTimestamps,
          showTimestamps: state.showTimestamps,
          setShowTimestamps,
          showSegmentView,
          followTimestampsActive,
          detail: props,
        })}
      />
      <LibraryDetailModals
        item={item}
        models={props.models}
        showDeleteConfirm={state.showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        showTranslations={state.showTranslations}
        setShowTranslations={setShowTranslations}
        showRetranscribe={state.showRetranscribe}
        setShowRetranscribe={setShowRetranscribe}
        onDelete={props.onDelete}
        onRetry={props.onRetry}
        onUpdate={props.onUpdate}
      />
      <LibraryDetailKeyboardBridge
        close={props.onClose}
        togglePlayback={player.handleTogglePlayback}
        timestampStep={handleTimestampStep}
        deleteOpen={state.showDeleteConfirm}
        closeDelete={() => setShowDeleteConfirm(false)}
        segmentView={showSegmentView}
        lastNavigation={refs.lastTimestampNavigation}
      />
      <LibraryDetailSearchSync
        query={search.query}
        segmentView={showSegmentView}
        streaming={showStreaming}
        segmentMatches={search.segmentMatches}
        streamMatches={search.streamMatches}
        activeSearch={state.activeSearchIndex}
        textMatch={search.textMatch}
        segments={refs.segmentsVirtuoso}
        stream={refs.streamVirtuoso}
        textarea={refs.transcriptArea}
      />
      <LibraryDetailFollowSync
        enabled={followTimestampsActive}
        activeSegment={activeSegment}
        visiblePosition={visibleActivePosition}
        scroller={refs.segmentsScroller}
        virtuoso={refs.segmentsVirtuoso}
        scrollTo={scrollToFollowTarget}
      />
      {showSegmentView ? (
        <LibraryDetailScrollInterruption
          scroller={refs.segmentsScroller}
          stop={stopFollowScroll}
        />
      ) : null}
    </div>
  );
}
