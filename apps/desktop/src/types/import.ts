type Fields<Names extends PropertyKey, Value> = {
  [Field in Names]: Value;
};

export type DetectedApp = Fields<"id" | "name", string>;

type ImportContentCounts = Fields<
  | "dictionaryCount"
  | "replacementsCount"
  | "personalitiesCount"
  | "transcriptCount",
  number
>;

type PreviewMetadata = Fields<
  "shortcut" | "language" | "modelSource" | "modelKey",
  string | null
> &
  Fields<"autoLaunch", boolean | null> &
  Fields<"modelRecognized", boolean>;

export interface ImportPreview
  extends DetectedApp, ImportContentCounts, PreviewMetadata {}

type ImportSelectionCatalog = {
  dictionary: unknown;
  replacements: unknown;
  personalities: unknown;
  shortcut: unknown;
  language: unknown;
  autoLaunch: unknown;
  model: unknown;
  history: unknown;
};

export type ImportSelection = keyof ImportSelectionCatalog;
export type ImportSelections = Fields<ImportSelection, boolean>;

type ImportedContentCounts = Fields<
  | "dictionaryAdded"
  | "replacementsAdded"
  | "personalitiesAdded"
  | "transcriptsAdded",
  number
>;

type ImportApplicationResult = Fields<
  | "shortcutApplied"
  | "languageApplied"
  | "autoLaunchApplied"
  | "modelUnrecognized",
  boolean
> &
  Fields<"shortcut" | "modelKey", string | null> &
  Fields<"autoLaunch", boolean | null>;

export interface ImportResult
  extends ImportedContentCounts, ImportApplicationResult {}
