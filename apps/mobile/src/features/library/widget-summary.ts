import type { MeetingSession, Note } from "@looper/data";
import { buildLibraryItems } from "./library-logic";

export type WidgetSummary = {
  lastCaptureDetail: string;
  lastCaptureTitle: string | null;
  weeklyWordCount: number;
};

export function buildWidgetSummary(notes: Note[], meetings: MeetingSession[]): WidgetSummary {
  const items = buildLibraryItems(notes, meetings, "all");
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1_000;
  const weeklyWordCount = items
    .filter((item) => item.updatedAt >= weekStart)
    .reduce((total, item) => total + wordCount(item.preview), 0);
  const latest = [...items].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  return {
    lastCaptureDetail: latest
      ? `Última captura · ${kindLabel(latest.kind)}`
      : "Aún no hay capturas",
    lastCaptureTitle: latest?.title ?? null,
    weeklyWordCount,
  };
}

function kindLabel(kind: ReturnType<typeof buildLibraryItems>[number]["kind"]): string {
  return kind === "meeting" ? "Reunión" : kind === "dictation" ? "Dictado" : "Nota";
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
