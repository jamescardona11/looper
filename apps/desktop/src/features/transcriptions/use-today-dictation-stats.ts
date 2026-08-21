import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import type { TranscriptionRecord } from "../../contracts";
import { deriveTodayStats } from "./todayStats";
import {
  transcriptionKeys,
  transcriptionListQuery,
} from "./transcription-query-policy";

export function useTodayDictationStats(enabled = true, dayTick = 0) {
  const queryClient = useQueryClient();
  const currentDay = new Date().toDateString();
  const observedDayRef = useRef(currentDay);

  useEffect(() => {
    if (observedDayRef.current === currentDay) return;
    observedDayRef.current = currentDay;
    queryClient.invalidateQueries({ queryKey: transcriptionKeys.list() });
  }, [currentDay, queryClient]);

  const summarizeCurrentDay = useCallback(
    (records: TranscriptionRecord[]) => deriveTodayStats(records),
    [currentDay, dayTick],
  );

  return useQuery({
    ...transcriptionListQuery(enabled),
    select: summarizeCurrentDay,
  });
}
