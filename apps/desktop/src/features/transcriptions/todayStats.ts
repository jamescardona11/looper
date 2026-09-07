import type { TodayDictationStats, TranscriptionRecord } from "../../contracts";
import { pickStableForCurrentPeriod } from "./homeGreeting";

export const EMPTY_TODAY_DICTATION_STATS: TodayDictationStats = {
  count: 0,
  words: 0,
  audioSeconds: 0,
  longestWords: 0,
  longestAudioSeconds: 0,
  llmCleanedCount: 0,
};

export type WeeklyDictationDay = {
  day: "L" | "M" | "X" | "J" | "V" | "S" | "D";
  height: number;
  words: number;
};

export type WeeklyDictationActivity = {
  days: WeeklyDictationDay[];
  words: number;
};

const WEEK_DAY_LABELS: WeeklyDictationDay["day"][] = [
  "L",
  "M",
  "X",
  "J",
  "V",
  "S",
  "D",
];

export const EMPTY_WEEKLY_DICTATION_ACTIVITY: WeeklyDictationActivity = {
  days: WEEK_DAY_LABELS.map((day) => ({ day, height: 0, words: 0 })),
  words: 0,
};

export function deriveWeeklyDictationActivity(
  records: TranscriptionRecord[],
  now: Date = new Date(),
): WeeklyDictationActivity {
  const currentDay = now.getDay();
  const mondayOffset = currentDay === 0 ? 6 : currentDay - 1;
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - mondayOffset,
  ).getTime();
  const nextWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - mondayOffset + 7,
  ).getTime();
  const wordsByDay = Array.from({ length: 7 }, () => 0);

  for (const record of records) {
    if (record.status !== "success") continue;
    const timestamp = new Date(record.timestamp).getTime();
    if (
      Number.isNaN(timestamp) ||
      timestamp < weekStart ||
      timestamp >= nextWeek
    ) {
      continue;
    }
    const dayIndex = Math.floor((timestamp - weekStart) / 86_400_000);
    wordsByDay[dayIndex] += record.word_count;
  }

  const peak = Math.max(...wordsByDay, 0);
  return {
    days: WEEK_DAY_LABELS.map((day, index) => ({
      day,
      height: peak > 0 ? Math.round((wordsByDay[index] / peak) * 100) : 0,
      words: wordsByDay[index],
    })),
    words: wordsByDay.reduce((total, words) => total + words, 0),
  };
}

export function deriveTodayStats(
  records: TranscriptionRecord[],
): TodayDictationStats {
  const now = new Date();
  const startMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const endMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();

  const stats = { ...EMPTY_TODAY_DICTATION_STATS };
  for (const record of records) {
    if (record.status !== "success") continue;
    const ts = new Date(record.timestamp).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts >= endMs) continue;
    stats.count += 1;
    stats.words += record.word_count;
    stats.audioSeconds += record.audio_duration_seconds;
    stats.longestWords = Math.max(stats.longestWords, record.word_count);
    stats.longestAudioSeconds = Math.max(
      stats.longestAudioSeconds,
      record.audio_duration_seconds,
    );
    if (record.llm_cleaned) stats.llmCleanedCount += 1;
  }
  return stats;
}

export type TodayStatSlide =
  | "dictations_words"
  | "minutes_spoken"
  | "avg_words"
  | "longest_duration"
  | "longest_words"
  | "pace_wpm"
  | "llm_cleaned";

function getTodayStatSlides(stats: TodayDictationStats): TodayStatSlide[] {
  const slides: TodayStatSlide[] = ["dictations_words", "minutes_spoken"];

  if (stats.count > 0) {
    slides.push("avg_words");
  }
  if (stats.longestAudioSeconds > 0) {
    slides.push("longest_duration");
  }
  if (stats.longestWords > 0) {
    slides.push("longest_words");
  }
  if (stats.audioSeconds >= 45 && stats.words >= 20) {
    slides.push("pace_wpm");
  }
  if (stats.llmCleanedCount > 0) {
    slides.push("llm_cleaned");
  }

  return slides;
}

export function getActiveTodayStatSlide(
  stats: TodayDictationStats,
  now: Date = new Date(),
): TodayStatSlide | undefined {
  const slides = getTodayStatSlides(stats);
  return pickStableForCurrentPeriod(slides, 1, now);
}

export function averageWordsPerDictation(stats: TodayDictationStats): number {
  if (stats.count <= 0) return 0;
  return Math.round(stats.words / stats.count);
}

export function wordsPerMinute(stats: TodayDictationStats): number {
  if (stats.audioSeconds <= 0 || stats.words <= 0) return 0;
  return Math.round(stats.words / (stats.audioSeconds / 60));
}

export function formatRecordingClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
