import { describe, expectTypeOf, it } from "vitest";
import type {
  DetectedApp,
  ImportPreview,
  ImportResult,
  ImportSelection,
  ImportSelections,
} from "./import";

describe("import wire contracts", () => {
  it("keeps application identity and selectable categories", () => {
    expectTypeOf<DetectedApp["id"]>().toEqualTypeOf<string>();
    expectTypeOf<DetectedApp["name"]>().toEqualTypeOf<string>();
    expectTypeOf<keyof ImportSelections>().toEqualTypeOf<ImportSelection>();
    expectTypeOf<ImportSelections[ImportSelection]>().toEqualTypeOf<boolean>();
  });

  it("keeps preview counts and nullable discoveries", () => {
    expectTypeOf<ImportPreview["dictionaryCount"]>().toEqualTypeOf<number>();
    expectTypeOf<ImportPreview["transcriptCount"]>().toEqualTypeOf<number>();
    expectTypeOf<ImportPreview["shortcut"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ImportPreview["autoLaunch"]>().toEqualTypeOf<boolean | null>();
    expectTypeOf<ImportPreview["modelRecognized"]>().toEqualTypeOf<boolean>();
  });

  it("keeps imported counts and application outcomes", () => {
    expectTypeOf<ImportResult["dictionaryAdded"]>().toEqualTypeOf<number>();
    expectTypeOf<ImportResult["transcriptsAdded"]>().toEqualTypeOf<number>();
    expectTypeOf<ImportResult["shortcutApplied"]>().toEqualTypeOf<boolean>();
    expectTypeOf<ImportResult["modelKey"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ImportResult["modelUnrecognized"]>().toEqualTypeOf<boolean>();
  });
});
