import type {
  DetectedApp,
  ImportPreview,
  ImportSelection,
  ImportSelections,
} from "../../../contracts";

export type ImportSelectionState = {
  sourceId: string | null;
  values: ImportSelections;
};

export const DEFAULT_IMPORT_SELECTIONS: ImportSelections = {
  dictionary: true,
  replacements: true,
  personalities: true,
  shortcut: true,
  language: true,
  autoLaunch: true,
  model: true,
  history: true,
};

export function previewForImportSource(
  preview: ImportPreview | undefined,
  sourceId: string | null,
): ImportPreview | undefined {
  return preview?.id === sourceId ? preview : undefined;
}

export function importPreviewIsPending(input: {
  loading: boolean;
  fetching: boolean;
  matchingPreview: ImportPreview | undefined;
}): boolean {
  return (
    input.loading || (input.fetching && input.matchingPreview === undefined)
  );
}

export function availableImportCategories(
  preview: ImportPreview | undefined,
): ImportSelection[] {
  if (!preview) return [];
  const keys: ImportSelection[] = [];
  if (preview.dictionaryCount > 0) keys.push("dictionary");
  if (preview.replacementsCount > 0) keys.push("replacements");
  if (preview.personalitiesCount > 0) keys.push("personalities");
  if (preview.transcriptCount > 0) keys.push("history");
  if (preview.shortcut) keys.push("shortcut");
  if (preview.language) keys.push("language");
  if (preview.autoLaunch !== null) keys.push("autoLaunch");
  if (preview.modelRecognized && preview.modelKey) keys.push("model");
  return keys;
}

export function selectionsForSource(
  state: ImportSelectionState,
  sourceId: string | null,
): ImportSelections {
  return state.sourceId === sourceId ? state.values : DEFAULT_IMPORT_SELECTIONS;
}

export function toggleImportCategory(
  state: ImportSelectionState,
  sourceId: string | null,
  category: ImportSelection,
): ImportSelectionState {
  const current = selectionsForSource(state, sourceId);
  return {
    sourceId,
    values: { ...current, [category]: !current[category] },
  };
}

export function enabledImportCategoryCount(
  categories: ImportSelection[],
  selections: ImportSelections,
): number {
  return categories.reduce(
    (count, category) => count + Number(selections[category]),
    0,
  );
}

export function importSourceOptions(
  apps: DetectedApp[],
): Array<{ value: string; label: string }> {
  return apps.map(({ id, name }) => ({ value: id, label: name }));
}

export function importSourceName(
  apps: DetectedApp[],
  sourceId: string | null,
): string | undefined {
  return apps.find(({ id }) => id === sourceId)?.name;
}

export function needsModelSelection(
  preview: ImportPreview | undefined,
): boolean {
  return Boolean(preview?.modelSource && !preview.modelRecognized);
}
