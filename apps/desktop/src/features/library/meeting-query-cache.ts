import type { MeetingDetails, MeetingTranscriptUpdate } from "../../types";

export function appendFinalTranscript(
  details: MeetingDetails | undefined,
  update: MeetingTranscriptUpdate,
) {
  if (!details || !update.is_final) return details;
  if (details.live_transcript.some(({ id }) => id === update.id))
    return details;
  return {
    ...details,
    live_transcript: [
      ...details.live_transcript,
      {
        id: update.id,
        source: update.source,
        text: update.text,
        start_ms: update.start_ms,
        end_ms: update.end_ms,
      },
    ],
  };
}
