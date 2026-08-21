import { useLingui } from "@lingui/react/macro";
import { AnimatePresence } from "framer-motion";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Speaker, TranscriptSegment } from "../../../types";
import {
  selectedTranscriptSpeaker,
  type TranscriptSpeakerVariant,
} from "./transcript-speaker-chip-presentation";
import { TranscriptSpeakerMenu } from "./transcript-speaker-menu";
import { TranscriptSpeakerTrigger } from "./transcript-speaker-trigger";

type TranscriptSpeakerChipProps = {
  variant?: TranscriptSpeakerVariant;
  segment: TranscriptSegment;
  index: number;
  speakers: Speaker[];
  speakerById: Map<string, Speaker>;
  openIndex: number | null;
  setOpenIndex: Dispatch<SetStateAction<number | null>>;
  menuRef: RefObject<HTMLDivElement | null>;
  onAssign: (segmentIndex: number, speakerId: string | null) => Promise<void>;
  onAddSpeaker: () => Promise<Speaker>;
};

export function TranscriptSpeakerChip({
  variant = "dot",
  segment,
  index,
  speakers,
  speakerById,
  openIndex,
  setOpenIndex,
  menuRef,
  onAssign,
  onAddSpeaker,
}: TranscriptSpeakerChipProps) {
  const { t } = useLingui();
  const speaker = selectedTranscriptSpeaker(segment, speakerById);
  const menuOpen = openIndex === index;
  const accessibleName = speaker
    ? speaker.name
    : t({
        id: "library.detail.speaker.unassigned",
        message: "Assign speaker",
      });
  const nextIndex = 1;
  const visibleLabel =
    speaker?.name ??
    t({
      id: "library.detail.speaker_default_name",
      message: `Speaker ${nextIndex}`,
    });

  return (
    <div className="relative inline-flex max-w-full align-baseline">
      <TranscriptSpeakerTrigger
        variant={variant}
        speaker={speaker}
        menuOpen={menuOpen}
        accessibleName={accessibleName}
        visibleLabel={visibleLabel}
        onClick={(event) => {
          event.stopPropagation();
          setOpenIndex(menuOpen ? null : index);
        }}
      />
      <AnimatePresence>
        {menuOpen ? (
          <TranscriptSpeakerMenu
            speakers={speakers}
            currentSpeakerId={segment.speaker_id}
            segmentIndex={index}
            menuRef={menuRef}
            clearLabel={t({
              id: "library.detail.speaker.clear",
              message: "Clear speaker",
            })}
            createLabel={t({
              id: "library.detail.assign_new_speaker",
              message: "Assign new speaker",
            })}
            onAssign={onAssign}
            onAddSpeaker={onAddSpeaker}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
