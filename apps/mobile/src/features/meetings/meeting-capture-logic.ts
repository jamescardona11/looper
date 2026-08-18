const meetingTimeFormatter = new Intl.DateTimeFormat("es", {
  hour: "numeric",
  minute: "2-digit",
});

export function createMeetingIdentity(
  now: number,
  suffix: string,
): {
  meetingId: string;
  title: string;
} {
  const date = new Date(now);
  const title = meetingTimeFormatter.format(date);
  return {
    meetingId: `meeting_${now}_${suffix.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "mobile"}`,
    title: `Meeting · ${title}`,
  };
}

export function addMarkedMoment(moments: number[], timestampMs: number): number[] {
  const safeTimestamp = Math.max(0, Math.round(timestampMs));
  const last = moments.at(-1);
  if (last !== undefined && Math.abs(last - safeTimestamp) < 1000) return moments;
  return [...moments, safeTimestamp];
}

export function formatMeetingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
