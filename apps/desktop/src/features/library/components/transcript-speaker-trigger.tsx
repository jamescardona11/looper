import type { MouseEventHandler } from "react";

import type { Speaker } from "../../../types";
import {
  transcriptSpeakerDotClass,
  transcriptSpeakerTriggerClass,
  type TranscriptSpeakerVariant,
} from "./transcript-speaker-chip-presentation";

type TranscriptSpeakerTriggerProps = {
  variant: TranscriptSpeakerVariant;
  speaker: Speaker | null;
  menuOpen: boolean;
  accessibleName: string;
  visibleLabel: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

export function TranscriptSpeakerTrigger({
  variant,
  speaker,
  menuOpen,
  accessibleName,
  visibleLabel,
  onClick,
}: TranscriptSpeakerTriggerProps) {
  const visual =
    variant === "label" ? (
      <span style={{ color: speaker?.color ?? undefined }}>{visibleLabel}</span>
    ) : (
      <span
        className={transcriptSpeakerDotClass(Boolean(speaker))}
        style={{ backgroundColor: speaker?.color ?? "transparent" }}
        aria-hidden="true"
      />
    );

  return (
    <button
      type="button"
      onClick={onClick}
      title={accessibleName}
      aria-label={accessibleName}
      className={transcriptSpeakerTriggerClass(
        variant,
        Boolean(speaker),
        menuOpen,
      )}
    >
      {visual}
    </button>
  );
}
