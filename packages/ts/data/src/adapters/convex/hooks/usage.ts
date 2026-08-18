import { api } from "@looper/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { AudioUsageSnapshot } from "../../../types";

export function useAudioUsage(): {
  usage: AudioUsageSnapshot | null;
  isLoading: boolean;
  isAvailable: boolean;
} {
  const raw = useQuery(api.stt.usage.current);

  return {
    usage: (raw as AudioUsageSnapshot | null | undefined) ?? null,
    isLoading: raw === undefined,
    isAvailable: true,
  };
}
