import { describe, expect, test } from "vitest";

import type { Replacement, UserSnippet } from "../../../../contracts";
import {
  addDictionaryEntry,
  addDictionaryReplacement,
  addDictionarySnippet,
  DICTIONARY_ENTRY_LIMIT,
  dictionaryEntryLetter,
  editDictionaryEntry,
  editDictionaryReplacement,
  editDictionarySnippet,
  filterDictionaryEntries,
  removeDictionaryItem,
  sectionIsVisible,
} from "../dictionary-view-model";

describe("dictionary view policies", () => {
  test("filters and alphabetizes only the standalone dictionary", () => {
    const entries = ["Zulu", "alpha", "Alpine", "42nd"];

    expect(filterDictionaryEntries(entries, "al", false)).toEqual([
      "alpha",
      "Alpine",
    ]);
    expect(filterDictionaryEntries(entries, "", false)).toEqual([
      "42nd",
      "alpha",
      "Alpine",
      "Zulu",
    ]);
    expect(filterDictionaryEntries(entries, "", true)).toEqual(entries);
    expect(dictionaryEntryLetter(" alpha")).toBe("A");
    expect(dictionaryEntryLetter("42nd")).toBe("#");
  });

  test("adds entries only when trimmed, unique and below capacity", () => {
    expect(addDictionaryEntry(["Alpha"], " Beta ")).toEqual(["Beta", "Alpha"]);
    expect(addDictionaryEntry(["Alpha"], "Alpha")).toBeNull();
    expect(addDictionaryEntry(["Alpha"], "  ")).toBeNull();
    expect(
      addDictionaryEntry(
        Array.from(
          { length: DICTIONARY_ENTRY_LIMIT },
          (_, index) => `${index}`,
        ),
        "overflow",
      ),
    ).toBeNull();
  });

  test("edits entries and treats an empty edit as deletion", () => {
    expect(editDictionaryEntry(["Alpha", "Beta"], 1, " Gamma ")).toEqual([
      "Alpha",
      "Gamma",
    ]);
    expect(editDictionaryEntry(["Alpha", "Beta"], 0, "  ")).toEqual(["Beta"]);
    expect(removeDictionaryItem(["A", "B", "C"], 1)).toEqual(["A", "C"]);
  });

  test("keeps replacement validation and empty-destination semantics", () => {
    const existing: Replacement[] = [{ from: "teh", to: "the" }];

    expect(addDictionaryReplacement(existing, " Adress ", " address ")).toEqual(
      [{ from: "Adress", to: "address" }, ...existing],
    );
    expect(addDictionaryReplacement(existing, "TEH", "their")).toBeNull();
    expect(addDictionaryReplacement(existing, "", "ignored")).toBeNull();
    expect(editDictionaryReplacement(existing, 0, "filler", "")).toEqual([
      { from: "filler", to: "" },
    ]);
    expect(editDictionaryReplacement(existing, 0, " ", "ignored")).toEqual([]);
  });

  test("requires complete snippets and deduplicates triggers case-insensitively", () => {
    const existing: UserSnippet[] = [
      { trigger: "sig", expansion: "Best regards" },
    ];

    expect(addDictionarySnippet(existing, " Thanks ", " Thank you ")).toEqual([
      { trigger: "Thanks", expansion: "Thank you" },
      ...existing,
    ]);
    expect(addDictionarySnippet(existing, "SIG", "Duplicate")).toBeNull();
    expect(addDictionarySnippet(existing, "missing", " ")).toBeNull();
    expect(editDictionarySnippet(existing, 0, "sig2", "Updated")).toEqual([
      { trigger: "sig2", expansion: "Updated" },
    ]);
    expect(editDictionarySnippet(existing, 0, "sig", " ")).toEqual([]);
  });

  test("maps the combined and focused sections without changing route names", () => {
    expect(sectionIsVisible("all", "vocabulary")).toBe(true);
    expect(sectionIsVisible("all", "rules")).toBe(true);
    expect(sectionIsVisible("all", "snippets")).toBe(true);
    expect(sectionIsVisible("rules", "rules")).toBe(true);
    expect(sectionIsVisible("rules", "vocabulary")).toBe(false);
  });
});
