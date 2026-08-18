import type {
  Dispatch,
  MouseEventHandler,
  SetStateAction,
  TouchEventHandler,
} from "react";
import { useReducedMotion } from "framer-motion";
import type { LibraryItemPatch } from "../../../types";
import { LibraryPlayerRate } from "./library-player-footer-rate";
import { LibraryPlayerToggles } from "./library-player-footer-toggles";
import { LibraryPlayerTransport } from "./library-player-footer-transport";

export { playbackRateMotion } from "./library-player-footer-motion";

type LibraryPlayerFooterProps = {
  audioReady: boolean;
  audioError: string | null;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  audioCurrentTime: number;
  audioDuration: number;
  scrubberMax: number;
  scrubberValue: number;
  scrubberPercent: number;
  onScrubChange: (value: string) => void;
  onScrubStart: MouseEventHandler<HTMLInputElement> &
    TouchEventHandler<HTMLInputElement>;
  onScrubEnd: MouseEventHandler<HTMLInputElement> &
    TouchEventHandler<HTMLInputElement>;
  playbackRate: number;
  onPlaybackRateStep: (direction: -1 | 1) => void;
  canDecreasePlaybackRate: boolean;
  canIncreasePlaybackRate: boolean;
  onRateScrubStart: MouseEventHandler<HTMLSpanElement> &
    TouchEventHandler<HTMLSpanElement>;
  canShowTimestamps: boolean;
  showTimestamps: boolean;
  setShowTimestamps: Dispatch<SetStateAction<boolean>>;
  showSegmentView: boolean;
  followTimestampsActive: boolean;
  onFollowTimestampsChange: Dispatch<SetStateAction<boolean>>;
  onUpdate: (patch: LibraryItemPatch) => void;
};

export const LibraryPlayerFooter = ({
  audioReady,
  audioError,
  isPlaying,
  onTogglePlayback,
  audioCurrentTime,
  audioDuration,
  scrubberMax,
  scrubberValue,
  scrubberPercent,
  onScrubChange,
  onScrubStart,
  onScrubEnd,
  playbackRate,
  onPlaybackRateStep,
  canDecreasePlaybackRate,
  canIncreasePlaybackRate,
  onRateScrubStart,
  canShowTimestamps,
  showTimestamps,
  setShowTimestamps,
  showSegmentView,
  followTimestampsActive,
  onFollowTimestampsChange,
  onUpdate,
}: LibraryPlayerFooterProps) => {
  const reducedMotion = Boolean(useReducedMotion());
  const unavailable = !audioReady || Boolean(audioError);

  return (
    <footer
      data-ui-dock="meeting-player"
      className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--color-border-primary)] bg-surface-overlay px-4 pt-2.5 pb-1"
    >
      <div className="flex items-center gap-4">
        <LibraryPlayerTransport
          {...{
            unavailable,
            audioError,
            isPlaying,
            onTogglePlayback,
            audioCurrentTime,
            audioDuration,
            scrubberMax,
            scrubberValue,
            scrubberPercent,
            onScrubChange,
            onScrubStart,
            onScrubEnd,
          }}
        />
        <LibraryPlayerRate
          {...{
            unavailable,
            playbackRate,
            onPlaybackRateStep,
            canDecreasePlaybackRate,
            canIncreasePlaybackRate,
            onRateScrubStart,
            reducedMotion,
          }}
        />
        <LibraryPlayerToggles
          {...{
            canShowTimestamps,
            showTimestamps,
            setShowTimestamps,
            showSegmentView,
            followTimestampsActive,
            onFollowTimestampsChange,
            onUpdate,
          }}
        />
      </div>
    </footer>
  );
};
