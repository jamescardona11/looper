import { describe, expect, it } from "vitest";
import {
  dictationSettingsFromRow,
  dictionaryEntryFromRow,
  replacementRuleFromRow,
  userSnippetFromRow,
} from "./dictation-mappers";

describe("dictation mappers", () => {
  it("maps dictionary rows to plain domain entries", () => {
    expect(
      dictionaryEntryFromRow({
        _id: "dict_1",
        userId: "user_1",
        term: "Deepgram",
        createdAt: 1700000000000,
      }),
    ).toEqual({
      id: "dict_1",
      term: "Deepgram",
      createdAt: 1700000000000,
    });
  });

  it("maps replacement rows to plain domain rules", () => {
    expect(
      replacementRuleFromRow({
        _id: "rep_1",
        userId: "user_1",
        source: "gonna",
        destination: "going to",
        createdAt: 1700000000001,
      }),
    ).toEqual({
      id: "rep_1",
      source: "gonna",
      destination: "going to",
      createdAt: 1700000000001,
    });
  });

  it("maps a settings document while preserving opaque data", () => {
    const data = { styles: { selectedToneId: "tone-1" } };

    expect(
      dictationSettingsFromRow({
        _id: "settings_1",
        userId: "user_1",
        data,
        version: 2,
        updatedAt: 1700000000002,
      }),
    ).toEqual({
      id: "settings_1",
      data,
      version: 2,
      updatedAt: 1700000000002,
    });
  });

  it("maps snippet rows to plain domain snippets", () => {
    expect(
      userSnippetFromRow({
        _id: "snippet_1",
        userId: "user_1",
        trigger: "sig",
        expansion: "Best,\nJane",
        createdAt: 1700000000003,
      }),
    ).toEqual({
      id: "snippet_1",
      trigger: "sig",
      expansion: "Best,\nJane",
      createdAt: 1700000000003,
    });
  });

  it("returns null for a missing settings document", () => {
    expect(dictationSettingsFromRow(null)).toBeNull();
  });
});
