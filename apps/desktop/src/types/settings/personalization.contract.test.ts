import { describe, expectTypeOf, it } from "vitest";
import type {
  AppBinding,
  Personality,
  Replacement,
  UserSnippet,
} from "./personalization";

describe("personalization wire contracts", () => {
  it("keeps the replacement and snippet field shapes", () => {
    expectTypeOf<Replacement>().toEqualTypeOf<{ from: string; to: string }>();
    expectTypeOf<UserSnippet>().toEqualTypeOf<{
      trigger: string;
      expansion: string;
    }>();
  });

  it("keeps application identity nullable and optional", () => {
    expectTypeOf<AppBinding["name"]>().toEqualTypeOf<string>();
    expectTypeOf<AppBinding["identifier"]>().toEqualTypeOf<
      string | null | undefined
    >();
  });

  it("keeps every personality collection typed", () => {
    expectTypeOf<Personality["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Personality["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Personality["enabled"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Personality["apps"]>().toEqualTypeOf<AppBinding[]>();
    expectTypeOf<Personality["websites"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Personality["instructions"]>().toEqualTypeOf<string[]>();
  });
});
