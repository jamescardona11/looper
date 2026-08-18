import type { ModelInfo } from "../../types";

export type ModelStats = {
  languagesLabel: string;
  englishOnly: boolean;
};

const MB_PER_GB = 1_000;

export function formatModelSize(megabytes: number): string {
  if (megabytes < MB_PER_GB) {
    return `${Math.round(megabytes)} MB`;
  }

  return `${(megabytes / MB_PER_GB).toFixed(1)} GB`;
}

export function sortInstalledModels(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((left, right) => {
    const availabilityOrder = Number(left.downloadable) - Number(right.downloadable);

    return availabilityOrder || left.label.localeCompare(right.label);
  });
}

export function variantLabel(variant: string): string {
  return variant;
}

export function formatQuantLabel(variant: string): string | null {
  return variant === "" ? null : variantLabel(variant);
}

export function deriveModelStats(model: ModelInfo): ModelStats {
  const languageCount = model.supported_languages.length;
  const explicitLanguages = new Set(
    model.tags.map((tag) => tag.trim().toLocaleLowerCase()),
  );
  const englishOnly = modelUsesEnglishOnly(model, explicitLanguages);

  return {
    englishOnly,
    languagesLabel: englishOnly ? "English only" : `${languageCount} languages`,
  };
}

function modelUsesEnglishOnly(
  model: ModelInfo,
  tags: ReadonlySet<string>,
): boolean {
  if (tags.has("english")) return true;
  if (tags.has("multilingual")) return false;

  return (
    model.supported_languages.length <= 1 ||
    model.supported_languages.every(({ code }) =>
      code.toLocaleLowerCase().startsWith("en"),
    )
  );
}
