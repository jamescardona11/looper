import type { ModelInfo } from "../../contracts";

const ONBOARDING_MODEL_ORDER = [
  "parakeet_tdt_int8",
  "cohere_transcribe_int4",
] as const;

type ModelCatalog = {
  candidates: ModelInfo[];
  candidateByKey: Map<string, ModelInfo>;
};

const buildCatalog = (models: ModelInfo[]): ModelCatalog => {
  const candidateByKey = new Map<string, ModelInfo>();
  const candidates = models.reduce<ModelInfo[]>((result, model) => {
    if (model.downloadable) {
      result.push(model);
      if (!candidateByKey.has(model.key)) candidateByKey.set(model.key, model);
    }
    return result;
  }, []);
  return { candidates, candidateByKey };
};

const recommendationScore = (model: ModelInfo) =>
  model.tags.reduce(
    (score, tag) =>
      tag.toLowerCase().localeCompare("recommended") === 0 ? score + 1 : score,
    0,
  );

export const selectOnboardingModels = (models: ModelInfo[]) => {
  const { candidateByKey } = buildCatalog(models);
  return ONBOARDING_MODEL_ORDER.flatMap((key) => {
    const candidate = candidateByKey.get(key);
    return candidate ? [candidate] : [];
  });
};

export const selectDefaultOnboardingModel = (
  models: ModelInfo[],
  persistedModel: string,
) => {
  const catalog = buildCatalog(models);
  const persistedCandidate = catalog.candidateByKey.get(persistedModel);
  return (
    persistedCandidate?.key ?? catalog.candidates.at(0)?.key ?? persistedModel
  );
};

export const selectRecommendedOnboardingModel = (models: ModelInfo[]) => {
  const { candidates } = buildCatalog(models);
  return (
    candidates.reduce<ModelInfo | null>((recommended, candidate) => {
      if (recommended) return recommended;
      return recommendationScore(candidate) > 0 ? candidate : null;
    }, null) ??
    candidates.at(0) ??
    null
  );
};

const languageCandidates = (current: string, locale: string) => {
  const normalized = [current, locale]
    .map((language) => language.trim().toLowerCase())
    .filter((language) => language.length !== 0 && language !== "auto");
  return normalized.flatMap((language) => {
    const primaryLanguage = language.split("-", 1)[0];
    return primaryLanguage === language
      ? [language]
      : [language, primaryLanguage];
  });
};

export const chooseOnboardingLanguage = (
  model: Pick<ModelInfo, "engine_id" | "supported_languages"> | null,
  currentLanguage: string,
  localeLanguage: string,
) => {
  if (model?.engine_id !== "cohere") return currentLanguage;

  const canonicalCode = new Map(
    model.supported_languages.map((language) => [
      language.code.toLowerCase(),
      language.code,
    ]),
  );
  const selected = languageCandidates(currentLanguage, localeLanguage).find(
    (candidate) => canonicalCode.has(candidate),
  );

  return (
    (selected ? canonicalCode.get(selected) : undefined) ??
    canonicalCode.get("en") ??
    model.supported_languages.at(0)?.code ??
    "en"
  );
};
