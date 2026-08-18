import { useLingui as useItemActionTranslations } from "@lingui/react/macro";
import {
  ArrowClockwise as RetryIcon,
  ArrowUUpLeft as RestoreIcon,
  Check as CopiedIcon,
  Copy as CopyIcon,
  DotsThreeVertical as MenuIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
  Trash as DeleteIcon,
} from "@phosphor-icons/react";
import { AnimatePresence as Presence, motion as Animated } from "framer-motion";
import type { ReactNode, RefObject } from "react";
import type {
  TranscriptionItemActionPolicy,
  TranscriptionItemPresentation,
} from "../transcription-item-policy";

const MENU_ACTION_CLASS_NAME =
  "flex w-full items-center gap-2.5 px-3 py-2 ui-text-menu-item ui-color-secondary hover:bg-surface-elevated transition-colors";
const MENU_ACTION_DISABLED_CLASS_NAME = `${MENU_ACTION_CLASS_NAME} disabled:opacity-50`;
const MENU_DIVIDER = <div className="h-px bg-border-secondary mx-2" />;

function MenuAction(props: {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={() => void props.onClick()}
      disabled={props.disabled}
      className={props.className ?? MENU_ACTION_CLASS_NAME}
    >
      {props.children}
    </button>
  );
}

function ItemModelMetadata(props: {
  presentation: TranscriptionItemPresentation;
  cleaned: boolean;
}) {
  const { presentation } = props;
  if (
    !presentation.speechModel &&
    !presentation.mode &&
    !presentation.llmModel
  ) {
    return null;
  }
  return (
    <>
      <div className="px-3 pt-2.5 pb-2 space-y-0.5">
        <div className="ui-text-meta ui-color-disabled">
          {presentation.date} · {presentation.time}
        </div>
        {presentation.speechModel ? (
          <div
            className={`ui-text-meta truncate ${presentation.cloudModel ? "ui-color-cloud" : "ui-color-secondary"}`}
          >
            {presentation.speechModel}
          </div>
        ) : null}
        {presentation.llmModel && props.cleaned ? (
          <div className="ui-text-meta ui-color-local truncate">
            {presentation.llmModel}
          </div>
        ) : null}
        {presentation.mode ? (
          <div className="ui-text-meta ui-color-secondary truncate">
            {presentation.mode}
          </div>
        ) : null}
      </div>
      {MENU_DIVIDER}
    </>
  );
}

function ItemActionMenu(props: {
  presentation: TranscriptionItemPresentation;
  policy: TranscriptionItemActionPolicy;
  selectionText: string;
  audioPlaying: boolean;
  retrying: boolean;
  retryingCleanup: boolean;
  undoingCleanup: boolean;
  deleting: boolean;
  cleaned: boolean;
  onCopySelection: () => Promise<void>;
  onToggleAudio: () => void;
  onRetry: () => Promise<void>;
  onRetryCleanup: () => Promise<void>;
  onRestoreOriginal: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useItemActionTranslations();
  return (
    <Animated.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.12 }}
      className="ui-surface-menu absolute right-0 top-full mt-1 z-[100] min-w-[200px] origin-top-right"
    >
      <ItemModelMetadata
        presentation={props.presentation}
        cleaned={props.cleaned}
      />
      {props.selectionText.trim() ? (
        <>
          <MenuAction onClick={props.onCopySelection}>
            <CopyIcon size={12} className="text-content-muted" />
            <span>
              {t({
                id: "transcriptions.item.copy_selection",
                message: "Copy selection",
              })}
            </span>
          </MenuAction>
          {MENU_DIVIDER}
        </>
      ) : null}
      {!props.presentation.failed && props.policy.audioRetryAvailable ? (
        <MenuAction onClick={props.onToggleAudio}>
          {props.audioPlaying ? (
            <PauseIcon size={12} className="text-content-muted" />
          ) : (
            <PlayIcon size={12} className="text-content-muted" />
          )}
          <span>
            {props.audioPlaying
              ? t({
                  id: "transcriptions.item.pause_audio",
                  message: "Pause audio",
                })
              : t({
                  id: "transcriptions.item.play_audio",
                  message: "Play audio",
                })}
          </span>
        </MenuAction>
      ) : null}
      {props.policy.audioRetryAvailable ? (
        <MenuAction
          onClick={props.onRetry}
          disabled={props.retrying}
          className={MENU_ACTION_DISABLED_CLASS_NAME}
        >
          <RetryIcon size={12} className="text-cloud" />
          <span>
            {t({ id: "transcriptions.item.retry", message: "Retry" })}
          </span>
        </MenuAction>
      ) : null}
      {props.policy.cleanupVisible ? (
        <MenuAction
          onClick={props.onRetryCleanup}
          disabled={props.retryingCleanup}
          className={MENU_ACTION_DISABLED_CLASS_NAME}
        >
          <RetryIcon size={12} className="text-local" />
          <span>
            {props.cleaned
              ? t({
                  id: "transcriptions.item.retry_cleanup",
                  message: "Retry cleanup",
                })
              : t({
                  id: "transcriptions.item.run_cleanup",
                  message: "Run cleanup",
                })}
          </span>
        </MenuAction>
      ) : null}
      {props.policy.restoreOriginalVisible ? (
        <MenuAction
          onClick={props.onRestoreOriginal}
          disabled={props.undoingCleanup}
          className={MENU_ACTION_DISABLED_CLASS_NAME}
        >
          <RestoreIcon size={12} className="text-warning" />
          <span>
            {t({
              id: "transcriptions.item.restore_original",
              message: "Restore original transcript",
            })}
          </span>
        </MenuAction>
      ) : null}
      {props.policy.dividerVisible ? MENU_DIVIDER : null}
      <MenuAction
        onClick={props.onDelete}
        disabled={props.deleting}
        className="flex w-full items-center gap-2.5 px-3 py-2 ui-text-menu-item ui-color-error-strong hover:bg-red-500/10 transition-colors disabled:opacity-50"
      >
        <DeleteIcon size={12} />
        <span>
          {t({ id: "transcriptions.item.delete", message: "Delete" })}
        </span>
      </MenuAction>
    </Animated.div>
  );
}

function CopyTranscriptionButton(props: {
  copied: boolean;
  onCopy: () => Promise<void>;
}) {
  const { t } = useItemActionTranslations();
  const label = props.copied
    ? t({ id: "transcriptions.item.copied", message: "Copied" })
    : t({
        id: "transcriptions.item.copy_transcription",
        message: "Copy transcription",
      });
  return (
    <Animated.button
      onClick={() => void props.onCopy()}
      data-no-press
      className={`p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 hover:bg-surface-elevated ${props.copied ? "bg-surface-elevated" : ""}`}
      title={label}
      aria-label={label}
    >
      <Animated.span
        className="flex origin-center"
        whileTap={{ scale: 0.9 }}
        transition={{ duration: 0.08 }}
      >
        {props.copied ? (
          <CopiedIcon size={14} className="text-success" aria-hidden="true" />
        ) : (
          <CopyIcon
            size={14}
            className="text-content-secondary"
            aria-hidden="true"
          />
        )}
      </Animated.span>
    </Animated.button>
  );
}

function ItemMenuButton(props: {
  shiftHeld: boolean;
  menuOpen: boolean;
  onPress: () => void;
}) {
  const { t } = useItemActionTranslations();
  const label = props.shiftHeld
    ? t({ id: "transcriptions.item.delete", message: "Delete" })
    : t({
        id: "transcriptions.item.more_options",
        message: "More options",
      });
  return (
    <Animated.button
      onClick={props.onPress}
      whileTap={{ scale: 0.95 }}
      className={`p-1.5 rounded-md transition-colors ${props.shiftHeld ? "hover:bg-red-500/10" : "hover:bg-surface-elevated"}`}
      title={label}
      aria-label={label}
      aria-haspopup="true"
      aria-expanded={props.menuOpen}
    >
      {props.shiftHeld ? (
        <DeleteIcon size={14} className="text-red-400" aria-hidden="true" />
      ) : (
        <MenuIcon size={14} className="text-content-muted" aria-hidden="true" />
      )}
    </Animated.button>
  );
}

function CleanupStatus(props: { undo: boolean }) {
  const { t } = useItemActionTranslations();
  return props.undo ? (
    <div className="flex items-center gap-1.5 ui-text-meta ui-color-warning">
      <RestoreIcon size={12} className="animate-pulse" />
      <span>
        {t({ id: "transcriptions.item.reverting", message: "Reverting..." })}
      </span>
    </div>
  ) : (
    <div className="flex items-center gap-1.5 ui-text-meta ui-color-local">
      <RetryIcon size={12} className="animate-spin" />
      <span>
        {t({ id: "transcriptions.item.cleaning", message: "Cleaning..." })}
      </span>
    </div>
  );
}

export function TranscriptionItemActions(props: {
  menuRef: RefObject<HTMLDivElement | null>;
  presentation: TranscriptionItemPresentation;
  policy: TranscriptionItemActionPolicy;
  copied: boolean;
  shiftHeld: boolean;
  menuOpen: boolean;
  selectionText: string;
  audioPlaying: boolean;
  retrying: boolean;
  retryingCleanup: boolean;
  undoingCleanup: boolean;
  deleting: boolean;
  cleaned: boolean;
  onCopy: () => Promise<void>;
  onCopySelection: () => Promise<void>;
  onMenuPress: () => void;
  onToggleAudio: () => void;
  onRetry: () => Promise<void>;
  onRetryCleanup: () => Promise<void>;
  onRestoreOriginal: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const idle =
    !props.retrying && !props.retryingCleanup && !props.undoingCleanup;
  return (
    <>
      {idle ? (
        <div
          className="relative shrink-0 flex items-center gap-1"
          ref={props.menuRef}
        >
          {props.presentation.failed ? null : (
            <CopyTranscriptionButton
              copied={props.copied}
              onCopy={props.onCopy}
            />
          )}
          <ItemMenuButton
            shiftHeld={props.shiftHeld}
            menuOpen={props.menuOpen}
            onPress={props.onMenuPress}
          />
          <Presence>
            {props.menuOpen ? <ItemActionMenu {...props} /> : null}
          </Presence>
        </div>
      ) : null}
      {props.retryingCleanup ? <CleanupStatus undo={false} /> : null}
      {props.undoingCleanup ? <CleanupStatus undo /> : null}
    </>
  );
}
