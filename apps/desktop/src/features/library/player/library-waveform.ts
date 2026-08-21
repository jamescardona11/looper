import type { TranscriptSegment } from "../../../contracts";

export type MiniWaveformBar = {
  height: number;
  speakerIndex: number;
};

export function buildMiniWaveform(
  segments: TranscriptSegment[] | null | undefined,
): MiniWaveformBar[] {
  if (!segments?.length) return [];

  const sampled = segments.slice(0, 12);
  const durations = sampled.map((segment) =>
    Math.max(1, segment.end_ms - segment.start_ms),
  );
  const maxDuration = Math.max(...durations);
  const speakerIndexes = new Map<string, number>();

  return sampled.map((segment, index) => {
    const speakerId = segment.speaker_id?.trim() || "unknown";
    if (!speakerIndexes.has(speakerId)) {
      speakerIndexes.set(speakerId, speakerIndexes.size % 6);
    }
    return {
      height: Math.round(6 + (durations[index] / maxDuration) * 14),
      speakerIndex: speakerIndexes.get(speakerId) ?? 0,
    };
  });
}
