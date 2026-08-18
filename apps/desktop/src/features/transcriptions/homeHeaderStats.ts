import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  averageWordsPerDictation,
  formatRecordingClock,
  type TodayStatSlide,
  wordsPerMinute,
} from "./todayStats";
import type { TodayDictationStats } from "../../types";

const TODAY_STAT_MESSAGES = {
  dictationsWords: msg({
    id: "home.today.stats.dictations_words",
    message:
      "{count, plural, one {# dictation} other {# dictations}} · {words, plural, one {# word} other {# words}} today",
  }),
  secondsSpoken: msg({
    id: "home.today.stats.seconds_spoken",
    message:
      "{seconds, plural, one {# second spoken today} other {# seconds spoken today}}",
  }),
  minutesSpoken: msg({
    id: "home.today.stats.minutes_spoken",
    message:
      "{minutes, plural, one {# minute spoken today} other {# minutes spoken today}}",
  }),
  averageWords: msg({
    id: "home.today.stats.avg_words",
    message:
      "{avg, plural, one {About # word per dictation today} other {About # words per dictation today}}",
  }),
  longestDuration: msg({
    id: "home.today.stats.longest_duration",
    message: "Longest recording today: {duration}",
  }),
  longestWords: msg({
    id: "home.today.stats.longest_words",
    message:
      "{words, plural, one {Longest dictation today: # word} other {Longest dictation today: # words}}",
  }),
  pace: msg({
    id: "home.today.stats.pace_wpm",
    message: "About {wpm} words per minute today",
  }),
  llmCleaned: msg({
    id: "home.today.stats.llm_cleaned",
    message:
      "{count, plural, one {# dictation polished with AI today} other {# dictations polished with AI today}}",
  }),
} satisfies Record<string, MessageDescriptor>;

export function labelForTodayStatSlide(
  slide: TodayStatSlide,
  stats: TodayDictationStats,
  t: (descriptor: MessageDescriptor) => string,
): string {
  switch (slide) {
    case "dictations_words":
      return t({
        ...TODAY_STAT_MESSAGES.dictationsWords,
        values: { count: stats.count, words: stats.words },
      });
    case "minutes_spoken": {
      const seconds = Math.round(stats.audioSeconds);
      if (seconds < 60)
        return t({
          ...TODAY_STAT_MESSAGES.secondsSpoken,
          values: { seconds },
        });
      const minutes = Math.max(1, Math.round(seconds / 60));
      return t({
        ...TODAY_STAT_MESSAGES.minutesSpoken,
        values: { minutes },
      });
    }
    case "avg_words": {
      const avg = averageWordsPerDictation(stats);
      return t({
        ...TODAY_STAT_MESSAGES.averageWords,
        values: { avg },
      });
    }
    case "longest_duration":
      return t({
        ...TODAY_STAT_MESSAGES.longestDuration,
        values: { duration: formatRecordingClock(stats.longestAudioSeconds) },
      });
    case "longest_words":
      return t({
        ...TODAY_STAT_MESSAGES.longestWords,
        values: { words: stats.longestWords },
      });
    case "pace_wpm": {
      const wpm = wordsPerMinute(stats);
      return t({
        ...TODAY_STAT_MESSAGES.pace,
        values: { wpm },
      });
    }
    case "llm_cleaned":
      return t({
        ...TODAY_STAT_MESSAGES.llmCleaned,
        values: { count: stats.llmCleanedCount },
      });
    default:
      return "";
  }
}
