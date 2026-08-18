import { describe, expect, test } from "vitest";
import { EDIT_ACTIONS, TRANSFORM_PRESETS } from "./pill";

describe("pill interaction catalog", () => {
  test("keeps the numbered edit actions in command order", () => {
    expect(EDIT_ACTIONS.map(({ action, key }) => [key, action])).toEqual([
      ["1", "replace"],
      ["2", "insert"],
      ["3", "ask"],
      ["4", "copy"],
    ]);
  });

  test("offers every supported transform preset", () => {
    expect(TRANSFORM_PRESETS.map(({ preset }) => preset)).toEqual([
      "polish",
      "literal",
      "chat",
      "email",
      "prompt_better",
    ]);
  });
});
