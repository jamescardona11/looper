import { useLingui } from "@lingui/react/macro";
import { BookmarkSimple, CaretDown, Play } from "@phosphor-icons/react";
import { useState } from "react";
import type {
  MeetingNoteMarker,
  MeetingTranscriptSegment,
  TranscriptSegment,
} from "../../../contracts";
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
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  if (markers.length === 0) return null;

  return (
    <section
      className="mb-3 shrink-0"
      aria-label={t({
        id: "meeting.detail.captured_moments",
        message: "Captured moments",
      })}
    >
      <div className="mb-2 flex items-center gap-1.5 ui-text-meta font-medium text-content-secondary">
        <BookmarkSimple size={13} weight="fill" />
        <span>
          {t({
            id: "meeting.detail.captured_moments",
            message: "Captured moments",
          })}{" "}
          · {markers.length}
        </span>
      </div>
      <div className="border-t border-border-primary">
        {[...markers].reverse().map((marker) => {
          const selected = marker.id === selectedMarkerId;
          const transcript = meetingNoteTranscript(
            marker,
            segments,
            liveTranscript,
          );
          const source =
            transcript ||
            t({
              id: "meeting.detail.note_pending_transcript",
              message: "This moment will appear after transcription.",
            });

          return (
            <article key={marker.id} className="border-b border-border-primary">
              <div className="grid grid-cols-[56px_minmax(0,1fr)_32px] gap-3 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMarkerId(selected ? null : marker.id);
                  }}
                  aria-expanded={selected}
                  className="col-span-2 grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-md text-left outline-none transition-colors hover:text-[var(--color-toggle-on)] focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)]"
                >
                  <span className="pt-0.5 font-mono ui-text-micro tabular-nums text-content-muted">
                    {meetingNoteRangeLabel(marker)}
                  </span>
                  <span className="min-w-0">
                    <span className="block ui-text-body-sm-strong text-content-primary">
                      {t({
                        id: "meeting.detail.captured_moment",
                        message: "Captured moment",
                      })}
                    </span>
                    <span className="mt-1 block line-clamp-2 ui-text-meta leading-relaxed text-content-muted">
                      {source}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onPlay(marker.start_ms)}
                  disabled={!audioAvailable}
                  aria-label={t({
                    id: "library.modal.play_audio",
                    message: "Play audio",
                  })}
                  className="grid h-8 w-8 place-items-center self-start rounded-full border border-border-secondary text-[var(--color-toggle-on)] transition-colors hover:border-[var(--color-toggle-on)] hover:bg-[var(--color-toggle-on)] hover:text-surface-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Play size={11} weight="fill" className="translate-x-px" />
                </button>
              </div>
              {selected ? (
                <section className="mb-3 ml-[68px] rounded-[11px] border border-border-secondary bg-surface-elevated px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="ui-text-micro font-medium uppercase tracking-[0.12em] text-content-muted">
                      {t({ id: "meeting.detail.source", message: "Source" })}
                    </p>
                    <CaretDown
                      size={13}
                      aria-hidden="true"
                      className="text-content-muted"
                    />
                  </div>
                  <p className="mt-1.5 ui-text-body-sm leading-relaxed text-content-secondary">
                    {source}
                  </p>
                </section>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default CapturedMeetingNotes;
