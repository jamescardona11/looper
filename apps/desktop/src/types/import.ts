export interface DetectedApp {
  id: string;
  name: string;
}

interface ImportContentCounts {
  dictionaryCount: number;
  replacementsCount: number;
  personalitiesCount: number;
  transcriptCount: number;
}

export interface ImportPreview extends DetectedApp, ImportContentCounts {
  shortcut: string | null;
  language: string | null;
  autoLaunch: boolean | null;
  modelSource: string | null;
  modelKey: string | null;
  modelRecognized: boolean;
}

export type ImportSelection =
  | "dictionary"
  | "replacements"
  | "personalities"
  | "shortcut"
  | "language"
  | "autoLaunch"
  | "model"
  | "history";

export type ImportSelections = Record<ImportSelection, boolean>;

interface ImportedContentCounts {
  dictionaryAdded: number;
  replacementsAdded: number;
  personalitiesAdded: number;
  transcriptsAdded: number;
}

export interface ImportResult extends ImportedContentCounts {
  shortcutApplied: boolean;
  shortcut: string | null;
  languageApplied: boolean;
  autoLaunchApplied: boolean;
  autoLaunch: boolean | null;
  modelKey: string | null;
  modelUnrecognized: boolean;
}
