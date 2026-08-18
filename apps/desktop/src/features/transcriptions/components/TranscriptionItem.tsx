import { useLingui as useItemTranslations } from "@lingui/react/macro";
import { memo, useRef, useState, type MouseEvent } from "react";
import type { TranscriptionRecord } from "../../../types";
import { useCopyToClipboard as useItemClipboard } from "../../../shared/hooks/useCopyToClipboard";
import { useClickOutside as useDismissItemMenu } from "../../../shared/hooks/useClickOutside";
import { useSpeechModels } from "../../settings/models-queries";
import {
  describeTranscriptionItem,
  selectedTranscriptText,
  transcriptionItemActionPolicy,
} from "../transcription-item-policy";
import { TranscriptionItemActions } from "./transcription-item-actions";
import { TranscriptionItemContent } from "./transcription-item-content";
import {
  TranscriptOverflowSensor,
  TranscriptionAudioLifetime,
  toggleTranscriptionPlayback,
} from "./transcription-item-lifecycle";

interface TranscriptionItemProps {
  record: TranscriptionRecord;
  onDelete: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onCancelRetry?: (id: string) => Promise<void>;
  onRetryLlm?: (id: string) => Promise<void>;
  onUndoLlm?: (id: string) => Promise<void>;
  isRetrying?: boolean;
  showLlmButtons?: boolean;
  shiftHeld?: boolean;
  showDate?: boolean;
}

function TranscriptionItem({
  record,
  onDelete,
  onRetry,
  onCancelRetry,
  onRetryLlm,
  onUndoLlm,
  isRetrying = false,
  showLlmButtons = false,
  shiftHeld = false,
  showDate = false,
}: TranscriptionItemProps) {
  const { t } = useItemTranslations();
  const { data: speechModels } = useSpeechModels();
  const { copied, copy } = useItemClipboard(2_000);
  const [deleting, setDeleting] = useState(false);
  const [cancellingRetry, setCancellingRetry] = useState(false);
  const [retryingCleanup, setRetryingCleanup] = useState(false);
  const [undoingCleanup, setUndoingCleanup] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [audioPlaying, setAudioPlaying] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  const closeMenu = () => {
    setMenuVisible(false);
    setSelectedText("");
  };
  useDismissItemMenu(menuRef, closeMenu, menuVisible);

  const presentation = describeTranscriptionItem(
    record,
    speechModels,
    t({
      id: "transcriptions.item.error.default",
      message: "Transcription failed",
    }),
  );
  const actionPolicy = transcriptionItemActionPolicy({
    failed: presentation.failed,
    cloudModel: presentation.cloudModel,
    showLlmButtons,
    retryLlmAvailable: onRetryLlm !== undefined,
    undoLlmAvailable: onUndoLlm !== undefined,
    cleaned: record.llm_cleaned,
    rawTextAvailable: Boolean(record.raw_text),
    retryingCleanup,
    undoingCleanup,
    audioRetryAvailable: presentation.audioRetryAvailable,
  });

  const captureTranscriptSelection = () => {
    const selected = selectedTranscriptText(
      textRef.current,
      window.getSelection(),
    );
    setSelectedText(selected);
    return selected;
  };
  const openActionMenu = () => {
    captureTranscriptSelection();
    setMenuVisible(true);
  };
  const pressMenuButton = () => {
    if (shiftHeld) {
      void removeRecord();
    } else if (menuVisible) {
      closeMenu();
    } else {
      openActionMenu();
    }
  };
  const copyTranscript = async () => {
    if (await copy(record.text)) closeMenu();
  };
  const copySelectedText = async () => {
    if (!selectedText.trim()) return;
    try {
      await navigator.clipboard.writeText(selectedText);
      closeMenu();
    } catch (error) {
      console.error("Failed to copy selection:", error);
    }
  };
  const removeRecord = async () => {
    if (deleting) return;
    setDeleting(true);
    closeMenu();
    try {
      await onDelete(record.id);
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setDeleting(false);
    }
  };
  const retryRecord = async () => {
    if (isRetrying) return;
    closeMenu();
    try {
      await onRetry(record.id);
    } catch (error) {
      console.error("Failed to retry:", error);
    }
  };
  const cancelActiveRetry = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (cancellingRetry || !onCancelRetry) return;
    setCancellingRetry(true);
    try {
      await onCancelRetry(record.id);
    } catch (error) {
      console.error("Failed to stop retry:", error);
    } finally {
      setCancellingRetry(false);
    }
  };
  const retryCleanup = async () => {
    if (retryingCleanup || !onRetryLlm) return;
    setRetryingCleanup(true);
    closeMenu();
    try {
      await onRetryLlm(record.id);
    } catch (error) {
      console.error("Failed to retry cleanup:", error);
    } finally {
      setRetryingCleanup(false);
    }
  };
  const restoreOriginal = async () => {
    if (undoingCleanup || !onUndoLlm) return;
    setUndoingCleanup(true);
    closeMenu();
    try {
      await onUndoLlm(record.id);
    } catch (error) {
      console.error("Failed to undo cleanup:", error);
    } finally {
      setUndoingCleanup(false);
    }
  };
  const toggleAudio = () =>
    toggleTranscriptionPlayback({
      available: record.audio_available,
      path: record.audio_path,
      playbackRef,
      onPlayingChange: setAudioPlaying,
    });

  return (
    <div
      className="group relative"
      onContextMenu={(event) => {
        if (!actionPolicy.contextMenuAllowed) return;
        event.preventDefault();
        if (shiftHeld) void removeRecord();
        else openActionMenu();
      }}
    >
      <TranscriptionAudioLifetime
        key={record.audio_path}
        playbackRef={playbackRef}
        onPlayingChange={setAudioPlaying}
      />
      <TranscriptOverflowSensor
        contentKey={record.text}
        expanded={expanded}
        textRef={textRef}
        onOverflowChange={setOverflowing}
      />
      <div
        className={`flex items-start gap-2 py-2.5 px-3 rounded-lg transition-colors ${presentation.failed ? "bg-red-500/[0.03]" : "hover:bg-[var(--surface-interactive)]"}`}
      >
        <TranscriptionItemContent
          presentation={presentation}
          showDate={showDate}
          retrying={isRetrying}
          cancellingRetry={cancellingRetry}
          cancelRetryAvailable={onCancelRetry !== undefined}
          onCancelRetry={cancelActiveRetry}
          textRef={textRef}
          expanded={expanded}
          overflowing={overflowing}
          onSelectionChange={captureTranscriptSelection}
          onToggleExpanded={() => setExpanded((current) => !current)}
        />
        <TranscriptionItemActions
          menuRef={menuRef}
          presentation={presentation}
          policy={actionPolicy}
          copied={copied}
          shiftHeld={shiftHeld}
          menuOpen={menuVisible}
          selectionText={selectedText}
          audioPlaying={audioPlaying}
          retrying={isRetrying}
          retryingCleanup={retryingCleanup}
          undoingCleanup={undoingCleanup}
          deleting={deleting}
          cleaned={record.llm_cleaned}
          onCopy={copyTranscript}
          onCopySelection={copySelectedText}
          onMenuPress={pressMenuButton}
          onToggleAudio={toggleAudio}
          onRetry={retryRecord}
          onRetryCleanup={retryCleanup}
          onRestoreOriginal={restoreOriginal}
          onDelete={removeRecord}
        />
      </div>
    </div>
  );
}

export default memo(TranscriptionItem);
