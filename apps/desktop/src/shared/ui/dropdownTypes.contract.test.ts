import { describe, expectTypeOf, it } from "vitest";
import type {
  DropdownEditableInput,
  DropdownOption,
  DropdownValue,
} from "./dropdownTypes";

describe("dropdown public contracts", () => {
  it("supports only scalar option identities", () => {
    expectTypeOf<DropdownValue>().toEqualTypeOf<string | number>();
    expectTypeOf<DropdownOption<42>["value"]>().toEqualTypeOf<42>();
  });

  it("keeps display metadata and flags optional", () => {
    type Badge = NonNullable<DropdownOption<string>["badges"]>[number];
    expectTypeOf<DropdownOption<string>["description"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Badge["label"]>().toEqualTypeOf<string>();
    expectTypeOf<Badge["highlighted"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<Badge["visible"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<DropdownOption<string>["locked"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("keeps editable input callbacks and labels", () => {
    expectTypeOf<DropdownEditableInput["value"]>().toEqualTypeOf<string>();
    expectTypeOf<DropdownEditableInput["onChange"]>().toEqualTypeOf<
      (value: string) => void
    >();
    expectTypeOf<DropdownEditableInput["ariaLabel"]>().toEqualTypeOf<
      string | undefined
    >();
  });
});
