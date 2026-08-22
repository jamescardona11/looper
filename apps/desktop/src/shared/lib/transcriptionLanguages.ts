import type { ModelInfo } from "../../contracts";

type LanguageIdentity = Record<"code" | "name", string>;
type LanguageOptionFlags = Partial<
  Record<"locked" | "isHeader" | "prominentHeader", boolean>
>;

export type TranscriptionLanguageOption = LanguageIdentity &
  LanguageOptionFlags & {
    description?: string;
  };

const DICTATION_LANGUAGES = [
  ["es", "Español"],
  ["en", "English"],
  ["pt", "Português"],
] as const;

const localeLanguage = (locale: string) =>
  locale.trim().toLowerCase().split(/[-_]/).at(0) ?? "";

export const languageSupportedByModel = (
  model: ModelInfo | undefined,
  language: string,
): boolean => {
  const requested = language.trim();
  if (!requested) return true;
  return Boolean(
    model?.supported_languages.find(({ code }) => code === requested),
  );
};

export const collectAllTranscriptionLanguages = (
  _models: ModelInfo[],
): TranscriptionLanguageOption[] =>
  DICTATION_LANGUAGES.map(([code, name]) => ({ code, name }));

const selectableLanguageCodes = (options: TranscriptionLanguageOption[]) =>
  options.flatMap((option) =>
    option.locked || option.isHeader ? [] : [option.code],
  );

export function resolveTranscriptionLanguage(
  language: string,
  options: TranscriptionLanguageOption[],
  fallbackLanguage = "en",
): string {
  const selectable = selectableLanguageCodes(options);
  const supported = new Set(selectable);
  const match = [language, fallbackLanguage, "en"]
    .map(localeLanguage)
    .find((code) => supported.has(code));
  return match ?? selectable.at(0) ?? "en";
}

type LanguagePartitions = Record<
  "available" | "unavailable",
  TranscriptionLanguageOption[]
>;

const partitionLanguages = (
  languages: TranscriptionLanguageOption[],
  supports: (language: TranscriptionLanguageOption) => boolean,
): LanguagePartitions => {
  const result: LanguagePartitions = { available: [], unavailable: [] };
  for (const language of languages) {
    const available = supports(language);
    result[available ? "available" : "unavailable"].push({
      ...language,
      locked: !available,
    });
  }
  return result;
};

type ActiveLanguageArguments = readonly [
  selectedModel: ModelInfo | undefined,
  catalog: TranscriptionLanguageOption[],
  remoteActive: boolean,
  blockedLabel: string,
  blockedDescription: string,
];

const unavailableDivider = (
  label: string,
  description: string,
): TranscriptionLanguageOption => ({
  code: "__unsupported__",
  name: label,
  description,
  isHeader: true,
  prominentHeader: true,
});

export function buildActiveTranscriptionLanguageOptions(
  ...[
    model,
    allLanguages,
    remoteSpeechActive,
    unsupportedLabel,
    unsupportedDescription,
  ]: ActiveLanguageArguments
): TranscriptionLanguageOption[] {
  const groups = partitionLanguages(
    allLanguages,
    (language) =>
      remoteSpeechActive || languageSupportedByModel(model, language.code),
  );
  if (groups.unavailable.length === 0) return groups.available;

  const divider = unavailableDivider(unsupportedLabel, unsupportedDescription);
  return groups.available.concat(divider, groups.unavailable);
}
