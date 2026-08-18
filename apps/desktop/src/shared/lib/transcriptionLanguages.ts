import type { ModelInfo } from "../../types";

export type TranscriptionLanguageOption = {
  code: string;
  name: string;
  locked?: boolean;
  isHeader?: boolean;
  prominentHeader?: boolean;
  description?: string;
};

const DICTATION_LANGUAGE_CATALOG = {
  es: "Español",
  en: "English",
  pt: "Português",
} as const;

function baseLanguage(language: string) {
  return language.trim().toLowerCase().split(/[-_]/, 1)[0] ?? "";
}

export function languageSupportedByModel(
  model: ModelInfo | undefined,
  language: string,
): boolean {
  const code = language.trim();
  if (!code) return true;
  return (
    model?.supported_languages.some((entry) => entry.code === code) ?? false
  );
}

export function collectAllTranscriptionLanguages(
  _models: ModelInfo[],
): TranscriptionLanguageOption[] {
  return Object.entries(DICTATION_LANGUAGE_CATALOG).map(([code, name]) => ({
    code,
    name,
  }));
}

export function resolveTranscriptionLanguage(
  language: string,
  options: TranscriptionLanguageOption[],
  fallbackLanguage = "en",
): string {
  const availableCodes = options
    .filter((option) => !option.locked && !option.isHeader)
    .map((option) => option.code);
  const available = new Set(availableCodes);

  for (const candidate of [language, fallbackLanguage, "en"]) {
    const code = baseLanguage(candidate);
    if (available.has(code)) return code;
  }
  return availableCodes[0] ?? "en";
}

export function buildActiveTranscriptionLanguageOptions(
  model: ModelInfo | undefined,
  allLanguages: TranscriptionLanguageOption[],
  remoteSpeechActive: boolean,
  unsupportedLabel: string,
  unsupportedDescription: string,
): TranscriptionLanguageOption[] {
  const partitions = allLanguages.reduce(
    (result, language) => {
      const supported =
        remoteSpeechActive || languageSupportedByModel(model, language.code);
      result[supported ? "available" : "unavailable"].push({
        ...language,
        locked: !supported,
      });
      return result;
    },
    {
      available: [] as TranscriptionLanguageOption[],
      unavailable: [] as TranscriptionLanguageOption[],
    },
  );

  if (!partitions.unavailable.length) return partitions.available;
  return [
    ...partitions.available,
    {
      code: "__unsupported__",
      name: unsupportedLabel,
      description: unsupportedDescription,
      isHeader: true,
      prominentHeader: true,
    },
    ...partitions.unavailable,
  ];
}
