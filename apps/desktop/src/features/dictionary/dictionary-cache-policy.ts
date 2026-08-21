import type { QueryClient } from "@tanstack/react-query";

import type { SuggestedCorrection } from "../../data/corrections";
import type { Replacement, StoredSettings, UserSnippet } from "../../types";
import { settingsKeys } from "../settings/preferences/queries";
import { dictionaryKeys } from "./dictionary-query-policy";

type DictionarySettingsPatch = Partial<
  Pick<StoredSettings, "dictionary" | "replacements" | "user_snippets">
>;

function mergeDictionarySettings(
  queryClient: QueryClient,
  patch: DictionarySettingsPatch,
) {
  queryClient.setQueryData<StoredSettings | undefined>(
    settingsKeys.detail(),
    (settings) => (settings ? { ...settings, ...patch } : settings),
  );
}

export function cacheSuggestedCorrections(
  queryClient: QueryClient,
  suggestions: SuggestedCorrection[],
) {
  queryClient.setQueryData(dictionaryKeys.suggestions(), suggestions);
}

export function cacheDictionaryEntries(
  queryClient: QueryClient,
  entries: string[],
) {
  mergeDictionarySettings(queryClient, { dictionary: entries });
}

export function cacheDictionaryReplacements(
  queryClient: QueryClient,
  replacements: Replacement[],
) {
  queryClient.setQueryData(dictionaryKeys.replacements(), replacements);
  mergeDictionarySettings(queryClient, { replacements });
}

export function cacheDictionarySnippets(
  queryClient: QueryClient,
  snippets: UserSnippet[],
) {
  queryClient.setQueryData(dictionaryKeys.snippets(), snippets);
  mergeDictionarySettings(queryClient, { user_snippets: snippets });
}
