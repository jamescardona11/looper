import { UserPlus } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { MouseEvent, RefObject } from "react";

import type { Speaker } from "../../../contracts";

type TranscriptSpeakerMenuProps = {
  speakers: Speaker[];
  currentSpeakerId?: string | null;
  segmentIndex: number;
  menuRef: RefObject<HTMLDivElement | null>;
  clearLabel: string;
  createLabel: string;
  onAssign: (segmentIndex: number, speakerId: string | null) => Promise<void>;
  onAddSpeaker: () => Promise<Speaker>;
};

function withoutPropagation(
  event: MouseEvent<HTMLButtonElement>,
  action: () => void | Promise<void>,
) {
  event.stopPropagation();
  void action();
}

export function TranscriptSpeakerMenu({
  speakers,
  currentSpeakerId,
  segmentIndex,
  menuRef,
  clearLabel,
  createLabel,
  onAssign,
  onAddSpeaker,
}: TranscriptSpeakerMenuProps) {
  const assignCreatedSpeaker = async () => {
    const created = await onAddSpeaker();
    await onAssign(segmentIndex, created.id);
  };

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.98, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -4 }}
      transition={{ duration: 0.12 }}
      className="absolute left-0 top-full mt-1 z-[120] w-36 rounded-md border border-border-secondary/80 bg-surface-overlay shadow-lg shadow-black/40 overflow-hidden"
    >
      {speakers.map((speaker) => (
        <SpeakerChoice
          key={speaker.id}
          speaker={speaker}
          onClick={(event) =>
            withoutPropagation(event, () => onAssign(segmentIndex, speaker.id))
          }
        />
      ))}
      {currentSpeakerId ? (
        <button
          type="button"
          onClick={(event) =>
            withoutPropagation(event, () => onAssign(segmentIndex, null))
          }
          className="w-full text-left px-2.5 py-1.5 ui-text-meta text-content-muted hover:bg-surface-elevated/70 hover:text-content-primary transition-colors border-t border-border-primary"
        >
          {clearLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={(event) => withoutPropagation(event, assignCreatedSpeaker)}
        className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 ui-text-meta text-content-muted hover:bg-surface-elevated/70 hover:text-content-primary transition-colors border-t border-border-primary"
      >
        <UserPlus size={11} />
        {createLabel}
      </button>
    </motion.div>
  );
}

function SpeakerChoice({
  speaker,
  onClick,
}: {
  speaker: Speaker;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 ui-text-meta font-medium text-content-secondary hover:bg-surface-elevated/70 hover:text-content-primary transition-colors"
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: speaker.color ?? undefined }}
        aria-hidden="true"
      />
      {speaker.name}
    </button>
  );
}
