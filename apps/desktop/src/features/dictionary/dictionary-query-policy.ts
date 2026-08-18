import { getSuggestedCorrections } from "../../data/corrections";
import {
  getDictionaryUsage,
  getLocalReplacements,
} from "../../data/dictionary-sync";
import { getLocalSnippets } from "../../data/snippets-sync";

const DICTIONARY_CACHE_ROOT = ["dictionary"] as const;
const USAGE_STALE_TIME = 60_000;

export const dictionaryKeys = {
  replacements: () => [...DICTIONARY_CACHE_ROOT, "replacements"] as const,
  snippets: () => [...DICTIONARY_CACHE_ROOT, "snippets"] as const,
  suggestions: () =>
    [...DICTIONARY_CACHE_ROOT, "suggested-corrections"] as const,
  usage: () => [...DICTIONARY_CACHE_ROOT, "usage"] as const,
};

export function dictionaryUsageQuery(enabled: boolean) {
  return {
    queryKey: dictionaryKeys.usage(),
    queryFn: getDictionaryUsage,
    enabled,
    staleTime: USAGE_STALE_TIME,
  };
}

export function replacementsQuery(enabled: boolean) {
  return {
    queryKey: dictionaryKeys.replacements(),
    queryFn: getLocalReplacements,
    enabled,
  };
}

export function snippetsQuery(enabled: boolean) {
  return {
    queryKey: dictionaryKeys.snippets(),
    queryFn: getLocalSnippets,
    enabled,
  };
}

export function suggestionsQuery(enabled: boolean) {
  return {
    queryKey: dictionaryKeys.suggestions(),
    queryFn: getSuggestedCorrections,
    enabled,
  };
}
