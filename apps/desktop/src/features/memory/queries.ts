import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchMemory, type MemorySearchFilter } from "../../data/memory";

export const memoryKeys = {
  all: ["memory"] as const,
  search: (filter: MemorySearchFilter) =>
    [...memoryKeys.all, "search", filter] as const,
};

export function useMemorySearch(filter: MemorySearchFilter, enabled: boolean) {
  return useQuery({
    queryKey: memoryKeys.search(filter),
    queryFn: () => searchMemory(filter),
    enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}
