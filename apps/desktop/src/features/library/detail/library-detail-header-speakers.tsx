import { useLingui } from "@lingui/react/macro";
import {
  CaretDown,
  PencilSimple,
  UserPlus,
  Users,
  X,
} from "@phosphor-icons/react";

import { HeaderMenuSurface } from "./library-detail-header-menu";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";
import type { Speaker } from "../../../types";

type SpeakersProps = Pick<
  LibraryDetailHeaderProps,
  | "handleAddSpeaker"
  | "handleRemoveSpeaker"
  | "handleRenameSpeaker"
  | "renamingSpeakerId"
  | "setRenamingSpeakerId"
  | "setSpeakerNameDraft"
  | "setSpeakersMenuOpen"
  | "speakerNameDraft"
  | "speakers"
  | "speakersMenuOpen"
  | "speakersMenuRef"
>;

const SPEAKER_MENU = [
  "absolute right-0 top-full mt-1 z-[120] w-48 rounded-md",
  "border border-border-secondary/80 bg-surface-overlay",
  "shadow-lg shadow-black/40 overflow-hidden",
].join(" ");

export function LibraryDetailSpeakers(props: SpeakersProps) {
  const { t } = useLingui();
  return (
    <div className="relative" ref={props.speakersMenuRef}>
      <button
        type="button"
        onClick={() => props.setSpeakersMenuOpen((open) => !open)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 ui-text-meta text-content-secondary hover:text-content-primary hover:bg-surface-surface transition-colors"
      >
        <Users size={11} />
        {t({ id: "library.detail.speakers", message: "Speakers" })}
        <span className="text-content-disabled tabular-nums">
          {props.speakers.length}
        </span>
        <CaretDown
          size={10}
          className={`transition-transform duration-150 ${props.speakersMenuOpen ? "rotate-180" : ""}`}
        />
      </button>
      <HeaderMenuSurface
        open={props.speakersMenuOpen}
        className={SPEAKER_MENU}
        motionStyle="popover"
      >
        {props.speakers.map((speaker) => (
          <SpeakerRow key={speaker.id} speaker={speaker} {...props} />
        ))}
        <button
          type="button"
          onClick={() => props.handleAddSpeaker()}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left ui-text-meta text-content-muted hover:bg-surface-elevated/70 hover:text-content-primary transition-colors border-t border-border-primary"
        >
          <UserPlus size={11} />
          {t({
            id: "library.detail.add_speaker",
            message: "Add speaker",
          })}
        </button>
      </HeaderMenuSurface>
    </div>
  );
}

function SpeakerRow({
  speaker,
  ...props
}: SpeakersProps & { speaker: Speaker }) {
  const { t } = useLingui();
  const editing = props.renamingSpeakerId === speaker.id;
  const cancelRename = () => {
    props.setRenamingSpeakerId(null);
    props.setSpeakerNameDraft("");
  };
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 group/speaker">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: speaker.color ?? undefined }}
        aria-hidden="true"
      />
      {editing ? (
        <input
          value={props.speakerNameDraft}
          aria-label={t({
            id: "library.detail.speaker.name",
            message: "Speaker name",
          })}
          onChange={(event) => props.setSpeakerNameDraft(event.target.value)}
          onBlur={() => props.handleRenameSpeaker(speaker.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void props.handleRenameSpeaker(speaker.id);
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
          className="flex-1 min-w-0 bg-transparent border-b border-[var(--color-border-primary)] px-0.5 py-0 ui-text-meta font-medium text-content-primary focus:border-[var(--color-border-hover)] outline-hidden"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            props.setRenamingSpeakerId(speaker.id);
            props.setSpeakerNameDraft(speaker.name);
          }}
          title={t({
            id: "library.detail.speaker.rename",
            message: "Click to rename",
          })}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left ui-text-meta font-medium text-content-secondary hover:text-content-primary transition-colors border-b border-transparent px-0.5 py-0"
        >
          <span className="truncate">{speaker.name}</span>
          <PencilSimple
            size={10}
            className="shrink-0 text-content-disabled opacity-0 group-hover/speaker:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        </button>
      )}
      <button
        type="button"
        onClick={() => props.handleRemoveSpeaker(speaker.id)}
        aria-label={t({
          id: "library.detail.speaker.remove",
          message: `Remove ${speaker.name}`,
        })}
        className="opacity-0 group-hover/speaker:opacity-100 text-content-disabled hover:text-red-500 transition-opacity shrink-0"
      >
        <X size={10} />
      </button>
    </div>
  );
}
