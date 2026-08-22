const SPEAKER_COLOR_COUNT = 6;

export const SPEAKER_COLORS = Array.from(
  { length: SPEAKER_COLOR_COUNT },
  (_, index) => `var(--data-speaker-${index + 1})`,
);

export function formatLibraryCreatedDate(createdAt: string) {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return null;

  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    day: "numeric",
    month: "short",
  });
  return formatter.format(timestamp);
}
