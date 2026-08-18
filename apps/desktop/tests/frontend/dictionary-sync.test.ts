import { describe, expect, test } from "vitest";
import {
  diffDictionary,
  diffReplacements,
  unionMergeDictionary,
  unionMergeReplacements,
} from "../../src/data/dictionary-sync";

describe("dictionary-sync: union merge (pull-on-reconnect)", () => {
  test("keeps local order and appends remote-only terms", () => {
    expect(unionMergeDictionary(["alpha", "beta"], ["beta", "gamma"])).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  test("is case-insensitive when de-duping", () => {
    expect(unionMergeDictionary(["Alpha"], ["alpha", "beta"])).toEqual([
      "Alpha",
      "beta",
    ]);
  });

  test("never drops a local-only term", () => {
    expect(unionMergeDictionary(["local-only"], [])).toEqual(["local-only"]);
  });

  test("replacements merge by `from`, remote-only rows are appended", () => {
    const local = [{ from: "teh", to: "the" }];
    const remote = [
      { from: "teh", to: "the" },
      { from: "adn", to: "and" },
    ];
    expect(unionMergeReplacements(local, remote)).toEqual([
      { from: "teh", to: "the" },
      { from: "adn", to: "and" },
    ]);
  });
});

describe("dictionary-sync: diff (push-on-change)", () => {
  test("detects additions and removals against the last-pushed snapshot", () => {
    expect(diffDictionary(["a", "b"], ["b", "c"])).toEqual({
      added: ["c"],
      removed: ["a"],
    });
  });

  test("no-op when nothing changed", () => {
    expect(diffDictionary(["a", "b"], ["a", "b"])).toEqual({
      added: [],
      removed: [],
    });
  });

  test("replacements diff treats a changed `to` as remove-old + add-new", () => {
    const previous = [{ from: "teh", to: "the" }];
    const next = [{ from: "teh", to: "THE" }];
    expect(diffReplacements(previous, next)).toEqual({
      added: [{ from: "teh", to: "THE" }],
      removed: [{ from: "teh", to: "the" }],
    });
  });

  test("replacements diff detects a plain addition", () => {
    const previous = [{ from: "teh", to: "the" }];
    const next = [
      { from: "teh", to: "the" },
      { from: "adn", to: "and" },
    ];
    expect(diffReplacements(previous, next)).toEqual({
      added: [{ from: "adn", to: "and" }],
      removed: [],
    });
  });
});
