import { describe, expectTypeOf, test } from "vitest";
import type { Howl, HowlOptions } from "howler";

describe("audio player type boundary", () => {
  test("covers the playback operations used by the library", () => {
    expectTypeOf<Howl>().toHaveProperty("play");
    expectTypeOf<Howl>().toHaveProperty("seek");
    expectTypeOf<Howl>().toHaveProperty("rate");
    expectTypeOf<HowlOptions["src"]>().toEqualTypeOf<string[]>();
  });
});
