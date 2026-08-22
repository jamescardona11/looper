import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import type { TodayDictationStats } from "../../../contracts";
import { labelForTodayStatSlide } from "../homeHeaderStats";
import {
  getHomeGreetingVariant,
  labelForHomeGreeting,
  useTimeOfDayPeriodTick,
} from "../homeGreeting";
import { getActiveTodayStatSlide } from "../todayStats";

export interface HomeTodayHeaderProps {
  readonly transcriptionsFetched: boolean;
  readonly stats: TodayDictationStats;
  readonly active: boolean;
}

function longLocalDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function useHomeTodayHeaderContent(
  stats: TodayDictationStats,
  active: boolean,
) {
  const { t: translate } = useLingui();
  const periodRevision = useTimeOfDayPeriodTick(active);
  const capturedAt = new Date();
  const activeSlide = useMemo(
    () => getActiveTodayStatSlide(stats, capturedAt),
    [
      periodRevision,
      stats,
      capturedAt.getFullYear(),
      capturedAt.getMonth(),
      capturedAt.getDate(),
    ],
  );

  return {
    dateLabel: longLocalDate(capturedAt),
    greeting: labelForHomeGreeting(
      getHomeGreetingVariant(capturedAt),
      translate,
    ),
    statText: activeSlide
      ? labelForTodayStatSlide(activeSlide, stats, translate)
      : "",
  };
}
