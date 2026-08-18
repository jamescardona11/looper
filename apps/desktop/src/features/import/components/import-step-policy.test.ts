import { describe, expect, test } from "vitest";
import type { ImportPreview } from "../../../types";
import {
  DEFAULT_IMPORT_SELECTIONS,
  availableImportCategories,
  enabledImportCategoryCount,
  importPreviewIsPending,
  needsModelSelection,
  previewForImportSource,
  selectionsForSource,
  toggleImportCategory,
  type ImportSelectionState,
} from "./import-step-policy";

const preview = (overrides: Partial<ImportPreview> = {}): ImportPreview => ({
  id: "source-a",
  name: "Source A",
  dictionaryCount: 2,
  replacementsCount: 1,
  personalitiesCount: 1,
  transcriptCount: 3,
  shortcut: "Cmd+Shift+Space",
  language: "en",
  autoLaunch: false,
  modelSource: "source-model",
  modelKey: "parakeet",
  modelRecognized: true,
  ...overrides,
});

describe("import step policy", () => {
  test("keeps the established category order and availability gates", () => {
    expect(availableImportCategories(preview())).toEqual([
      "dictionary",
      "replacements",
      "personalities",
      "history",
      "shortcut",
      "language",
      "autoLaunch",
      "model",
    ]);
    expect(
      availableImportCategories(
        preview({
          dictionaryCount: 0,
          replacementsCount: 0,
          personalitiesCount: 0,
          transcriptCount: 0,
          shortcut: null,
          language: null,
          autoLaunch: null,
          modelRecognized: false,
        }),
      ),
    ).toEqual([]);
  });

  test("resets every category when the source changes before toggling", () => {
    const original: ImportSelectionState = {
      sourceId: "source-a",
      values: { ...DEFAULT_IMPORT_SELECTIONS, dictionary: false },
    };
    expect(selectionsForSource(original, "source-a").dictionary).toBe(false);
    expect(selectionsForSource(original, "source-b")).toEqual(
      DEFAULT_IMPORT_SELECTIONS,
    );
    expect(toggleImportCategory(original, "source-b", "history")).toEqual({
      sourceId: "source-b",
      values: { ...DEFAULT_IMPORT_SELECTIONS, history: false },
    });
  });

  test("counts only visible selections and rejects stale previews", () => {
    const categories = ["dictionary", "history"] as const;
    expect(
      enabledImportCategoryCount([...categories], {
        ...DEFAULT_IMPORT_SELECTIONS,
        history: false,
      }),
    ).toBe(1);
    expect(previewForImportSource(preview(), "source-b")).toBeUndefined();
    expect(previewForImportSource(preview(), "source-a")?.id).toBe("source-a");
    expect(
      importPreviewIsPending({
        loading: false,
        fetching: true,
        matchingPreview: undefined,
      }),
    ).toBe(true);
  });

  test("requests model selection only for an unrecognized source model", () => {
    expect(needsModelSelection(preview({ modelRecognized: false }))).toBe(true);
    expect(needsModelSelection(preview({ modelSource: null }))).toBe(false);
  });
});
