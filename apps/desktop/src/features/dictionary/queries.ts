import { useQuery } from "@tanstack/react-query";

import {
  dictionaryUsageQuery,
  replacementsQuery,
  snippetsQuery,
  suggestionsQuery,
} from "./dictionary-query-policy";

export {
  cacheDictionaryEntries as setDictionaryEntriesCache,
  cacheDictionaryReplacements as setDictionaryReplacementsCache,
  cacheDictionarySnippets as setDictionarySnippetsCache,
  cacheSuggestedCorrections as setSuggestedCorrectionsCache,
} from "./dictionary-cache-policy";

export function useDictionaryUsage(enabled = true) {
  return useQuery(dictionaryUsageQuery(enabled));
}

export function useReplacements(enabled = true) {
  return useQuery(replacementsQuery(enabled));
}

export function useSnippets(enabled = true) {
  return useQuery(snippetsQuery(enabled));
}

export function useSuggestedCorrections(enabled = true) {
  return useQuery(suggestionsQuery(enabled));
}
