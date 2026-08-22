import { useLingui } from "@lingui/react/macro";
import { Pause, Play } from "@phosphor-icons/react";
import type { MouseEventHandler, TouchEventHandler } from "react";

import { formatDuration } from "../shared/library-utils";

type LibraryPlayerTransportProps = {
  unavailable: boolean;
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
};

export function LibraryPlayerTransport({
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
}: LibraryPlayerTransportProps) {
  const { t } = useLingui();
  const unavailableClass = unavailable ? "opacity-50 cursor-not-allowed" : "";
  const playbackLabel = isPlaying
    ? t({ id: "library.modal.pause_audio", message: "Pause audio" })
    : t({ id: "library.modal.play_audio", message: "Play audio" });

  return (
    <>
      <button
        type="button"
        onClick={onTogglePlayback}
        disabled={unavailable}
        className={`text-content-primary hover:text-content-secondary transition-colors shrink-0 translate-y-[2px] ${unavailableClass}`}
        aria-label={playbackLabel}
      >
        {isPlaying ? (
          <Pause size={16} className="fill-current" />
        ) : (
          <Play size={16} className="fill-current" />
        )}
      </button>

      <span className="ui-text-micro tabular-nums text-content-disabled font-medium tracking-wide shrink-0">
        {formatDuration(audioCurrentTime)}{" "}
        <span className="opacity-50">/ {formatDuration(audioDuration)}</span>
      </span>

      <div className="flex-1 min-w-0">
        {audioError ? (
          <span className="ui-text-meta text-content-disabled">
            {audioError}
          </span>
        ) : (
          <input
            type="range"
            min={0}
            max={scrubberMax}
            step={0.01}
            value={scrubberValue}
            onChange={(event) => onScrubChange(event.target.value)}
            onMouseDown={onScrubStart}
            onTouchStart={onScrubStart}
            onMouseUp={onScrubEnd}
            onTouchEnd={onScrubEnd}
            className="library-scrubber w-full"
            disabled={unavailable}
            style={{
              background: `linear-gradient(to right, var(--color-toggle-on) 0%, var(--color-toggle-on) ${scrubberPercent}%, var(--color-border-secondary) ${scrubberPercent}%, var(--color-border-secondary) 100%)`,
            }}
            aria-label={t({
              id: "library.modal.audio_scrubber",
              message: "Audio scrubber",
            })}
          />
        )}
      </div>
    </>
  );
}
