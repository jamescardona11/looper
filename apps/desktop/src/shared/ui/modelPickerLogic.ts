import { deriveModelStats } from "../lib/modelStats";
import type { ModelInfo } from "../../types/models";

export const MODEL_CATEGORY_ORDER = [
  "standard",
  "experimental",
  "legacy",
] as const;

const VARIANT_PRIORITY = new Map(
  ["Q5_1", "Q5_0", "Q8_0", "Full", "Int8"].map((variant, index) => [
    variant,
    index,
  ]),
);

export type ModelGroup = {
  id: string;
  label: string;
  category: string;
  englishOnly: boolean;
  variants: ModelInfo[];
  searchText: string;
};

function variantPriority(variant: string) {
  return VARIANT_PRIORITY.get(variant) ?? VARIANT_PRIORITY.size;
}

export function groupModelCatalog(catalog: ModelInfo[]): ModelGroup[] {
  const families = new Map<string, ModelInfo[]>();
  catalog.forEach((model) => {
    const variants = families.get(model.family) ?? [];
    variants.push(model);
    families.set(model.family, variants);
  });

  return [...families.entries()]
    .map(([id, familyVariants]) => {
      const variants = [...familyVariants].sort(
        (left, right) =>
          variantPriority(left.variant) - variantPriority(right.variant),
      );
      const representative = variants[0];
      if (!representative)
        throw new Error(`Model family ${id} has no variants`);
      const label = representative.label.replace(/\s*\([^)]*\)\s*/g, "").trim();
      return {
        id,
        label,
        category: representative.category,
        englishOnly: deriveModelStats(representative).englishOnly,
        variants,
        searchText: [
          label,
          representative.category,
          ...variants.flatMap((variant) => [
            variant.engine_id,
            ...variant.tags,
          ]),
        ]
          .join(" ")
          .toLowerCase(),
      };
    })
    .sort(
      (left, right) =>
        (left.variants[0]?.size_mb ?? 0) - (right.variants[0]?.size_mb ?? 0),
    );
}

export function preferredVariantKey(group: ModelGroup, activeKey: string) {
  return (
    group.variants.find((variant) => variant.key === activeKey)?.key ??
    group.variants.find((variant) => variant.variant === "Q8_0")?.key ??
    group.variants.at(-1)?.key ??
    ""
  );
}

export function filterModelGroups(
  groups: ModelGroup[],
  query: string,
  category: string | null,
) {
  const search = query.trim().toLowerCase();
  return groups.filter(
    (group) =>
      (!category || group.category === category) &&
      (!search || group.searchText.includes(search)),
  );
}

export function sectionModelGroups(groups: ModelGroup[]) {
  return MODEL_CATEGORY_ORDER.map((category) => ({
    category,
    groups: groups.filter((group) => group.category === category),
  })).filter((section) => section.groups.length > 0);
}
