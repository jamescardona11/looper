import { useLingui } from "@lingui/react/macro";
import { BookmarkSimple, Play } from "@phosphor-icons/react";
import type {
  MeetingNoteMarker,
  MeetingTranscriptSegment,
  TranscriptSegment,
} from "../../../types";
import {
  meetingNoteRangeLabel,
  meetingNoteTranscript,
} from "./meeting-note-markers";

type CapturedMeetingNotesProps = {
  markers: MeetingNoteMarker[];
  segments: TranscriptSegment[] | null | undefined;
  liveTranscript: MeetingTranscriptSegment[];
  audioAvailable: boolean;
  onPlay: (startMs: number) => void;
};

const CapturedMeetingNotes = ({
  markers,
  segments,
  liveTranscript,
  audioAvailable,
  onPlay,
}: CapturedMeetingNotesProps) => {
  const { t } = useLingui();
  if (markers.length === 0) return null;

  return (
    <section
      className="mb-3 shrink-0"
      aria-label={t({
        id: "meeting.detail.captured_moments",
        message: "Captured moments",
      })}
    >
      <div className="mb-1.5 flex items-center gap-1.5 ui-text-meta font-medium text-content-secondary">
        <BookmarkSimple size={13} weight="fill" />
        <span>
          {t({
            id: "meeting.detail.captured_moments",
            message: "Captured moments",
          })}{" "}
          · {markers.length}
        </span>
      </div>
      <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1 custom-scrollbar">
        {[...markers].reverse().map((marker) => {
          const transcript = meetingNoteTranscript(
            marker,
            segments,
            liveTranscript,
          );
          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onPlay(marker.start_ms)}
              disabled={!audioAvailable}
              className="rounded-lg border border-border-primary bg-surface-secondary px-3 py-2 text-left transition-colors hover:border-border-hover hover:bg-surface-elevated disabled:cursor-default disabled:hover:border-border-primary disabled:hover:bg-surface-secondary"
            >
              <span className="flex items-center justify-between ui-text-micro font-medium text-content-muted tabular-nums">
                <span>
                  {marker.kind === "important_moment"
                    ? `${t({
                        id: "meeting.detail.important_moment",
                        message: "Important moment",
                      })} · `
                    : ""}
                  {meetingNoteRangeLabel(marker)}
                </span>
                {audioAvailable ? <Play size={10} weight="fill" /> : null}
              </span>
              <span className="mt-1 block line-clamp-2 ui-text-meta leading-relaxed text-content-secondary">
                {transcript ||
                  t({
                    id: "meeting.detail.note_pending_transcript",
                    message: "This moment will appear after transcription.",
                  })}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default CapturedMeetingNotes;
