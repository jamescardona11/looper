import { invoke } from "@tauri-apps/api/core";

export const MEMORY_SOURCES = ["dictation", "library", "meeting"] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

type MemoryTimeRange = {
  since_ms?: number | null;
  until_ms?: number | null;
};

type MemoryContextFilter = {
  app_id?: string | null;
  workflow_id?: string | null;
};

export type MemorySearchFilter = MemoryTimeRange &
  MemoryContextFilter & {
    query: string;
    sources: MemorySource[];
    limit?: number;
  };

type MemoryResultContext = {
  app_id?: string | null;
  workflow_id?: string | null;
  workflow_name?: string | null;
};

export type MemorySearchResult = MemoryResultContext & {
  id: string;
  source: MemorySource;
  title: string;
  occurred_at: string;
  occurred_at_ms: number;
  excerpt: string;
  final_text: string;
  raw_text?: string | null;
  score: number;
  open_target: "history" | "library";
};

export function searchMemory(
  filter: MemorySearchFilter,
): Promise<MemorySearchResult[]> {
  return invoke("search_memory", { filter });
}
