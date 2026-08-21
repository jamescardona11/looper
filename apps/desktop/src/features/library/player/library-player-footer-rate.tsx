import { useLingui } from "@lingui/react/macro";
import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import type { MouseEventHandler, ReactNode, TouchEventHandler } from "react";

import { formatPlaybackRate } from "../shared/library-utils";
import {
  playbackRateMotion,
  playbackRateRestingFrame,
} from "./library-player-footer-motion";

type LibraryPlayerRateProps = {
  unavailable: boolean;
  playbackRate: number;
  onPlaybackRateStep: (direction: -1 | 1) => void;
  canDecreasePlaybackRate: boolean;
  canIncreasePlaybackRate: boolean;
  onRateScrubStart: MouseEventHandler<HTMLSpanElement> &
    TouchEventHandler<HTMLSpanElement>;
  reducedMotion: boolean;
};

export function LibraryPlayerRate({
  unavailable,
  playbackRate,
  onPlaybackRateStep,
  canDecreasePlaybackRate,
  canIncreasePlaybackRate,
  onRateScrubStart,
  reducedMotion,
}: LibraryPlayerRateProps) {
  const { t } = useLingui();
  const rateMotion = playbackRateMotion(reducedMotion);

  return (
    <div className="flex items-center gap-0.5 ui-text-micro leading-none shrink-0">
      <RateStepButton
        label={t({
          id: "library.modal.playback.decrease",
          message: "Decrease speed",
        })}
        disabled={unavailable || !canDecreasePlaybackRate}
        onClick={() => onPlaybackRateStep(-1)}
      >
        <ChevronLeft size={10} />
      </RateStepButton>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={playbackRate}
          initial={rateMotion.initial}
          animate={playbackRateRestingFrame}
          exit={rateMotion.exit}
          transition={rateMotion.transition}
          onMouseDown={onRateScrubStart}
          onTouchStart={onRateScrubStart}
          className="w-[26px] min-w-[26px] text-center font-medium text-content-secondary tabular-nums cursor-ew-resize select-none"
        >
          {formatPlaybackRate(playbackRate)}x
        </motion.span>
      </AnimatePresence>
      <RateStepButton
        label={t({
          id: "library.modal.playback.increase",
          message: "Increase speed",
        })}
        disabled={unavailable || !canIncreasePlaybackRate}
        onClick={() => onPlaybackRateStep(1)}
      >
        <ChevronRight size={10} />
      </RateStepButton>
    </div>
  );
}

function RateStepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const tone = disabled
    ? "text-content-disabled"
    : "text-content-muted hover:text-content-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`transition-colors p-0.5 ${tone}`}
    >
      {children}
    </button>
  );
}
