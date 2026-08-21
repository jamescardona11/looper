import { useQuery } from "@tanstack/react-query";
import { getMeetingAiStatus } from "../../../data/local-llm";
import type { LocalLlmModelState } from "../../../types/index";

export const meetingAiStatusKey = ["meeting-ai", "status"] as const;

export const meetingAiRefreshInterval = (
  state: LocalLlmModelState | undefined,
): number | false =>
  state === "downloading" || state === "verifying" ? 1_000 : false;

export const useMeetingAiStatus = (enabled = true) =>
  useQuery({
    queryKey: meetingAiStatusKey,
    queryFn: getMeetingAiStatus,
    enabled,
    refetchInterval: ({ state }) => meetingAiRefreshInterval(state.data?.state),
  });
