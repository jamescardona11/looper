import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { settingsKeys } from "../settings/queries";
import {
  setDictionaryEntriesCache,
  setDictionaryReplacementsCache,
  setDictionarySnippetsCache,
  setSuggestedCorrectionsCache,
} from "./queries";

describe("dictionary cache boundary", () => {
  test("patches each dictionary collection without discarding settings", () => {
    const client = new QueryClient();
    client.setQueryData(settingsKeys.detail(), {
      dictionary: ["old"],
      replacements: [],
      user_snippets: [],
      marker: "preserved",
    });

    setDictionaryEntriesCache(client, ["Looper"]);
    setDictionaryReplacementsCache(client, [{ from: "teh", to: "the" }]);
    setDictionarySnippetsCache(client, [
      { trigger: "/hello", expansion: "Hello there" },
    ]);

    expect(client.getQueryData(settingsKeys.detail())).toMatchObject({
      dictionary: ["Looper"],
      replacements: [{ from: "teh", to: "the" }],
      user_snippets: [{ trigger: "/hello", expansion: "Hello there" }],
      marker: "preserved",
    });
  });

  test("does not synthesize settings before the settings query is loaded", () => {
    const client = new QueryClient();

    setDictionaryEntriesCache(client, ["Looper"]);

    expect(client.getQueryData(settingsKeys.detail())).toBeUndefined();
  });

  test("stores suggestions in their independent cache", () => {
    const client = new QueryClient();
    const suggestions = [{ from: "loopr", to: "looper", count: 3 }];

    setSuggestedCorrectionsCache(client, suggestions);

    expect(client.getQueryData(["dictionary", "suggested-corrections"])).toBe(
      suggestions,
    );
  });
});
