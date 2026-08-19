// @vitest-environment jsdom

import type { ConvexClient } from "convex/browser";
import { beforeEach, describe, expect, test, vi } from "vitest";

const backendApi = vi.hoisted(() => ({
  dictation: {
    dictionary: {
      add: "dictionary:add",
      remove: "dictionary:remove",
      list: "dictionary:list",
    },
    replacements: {
      add: "replacements:add",
      remove: "replacements:remove",
      list: "replacements:list",
    },
    snippets: {
      add: "snippets:add",
      remove: "snippets:remove",
      list: "snippets:list",
    },
  },
}));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@looper/backend/convex/_generated/api", () => ({ api: backendApi }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  diffDictionary,
  diffReplacements,
  pushReplacementsDiff,
  unionMergeDictionary,
  unionMergeReplacements,
} from "./dictionary-sync";
import {
  diffSnippets,
  pushSnippetsDiff,
  unionMergeSnippets,
} from "./snippets-sync";

const fakeClient = () => ({
  mutation: vi.fn(),
  query: vi.fn(),
});

describe("sync reconciliation", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  test("unions remote dictionary content without deleting or reordering local terms", () => {
    expect(
      unionMergeDictionary(
        ["Looper", "Parakeet"],
        ["looper", "Cohere", " PARAKEET "],
      ),
    ).toEqual(["Looper", "Parakeet", "Cohere"]);
    expect(diffDictionary(["one", "two"], ["two", "three"])).toEqual({
      added: ["three"],
      removed: ["one"],
    });
  });

  test("appends remote-only rows and reports a no-op diff when nothing changed", () => {
    expect(unionMergeDictionary(["local-only"], [])).toEqual(["local-only"]);
    expect(diffDictionary(["a", "b"], ["a", "b"])).toEqual({
      added: [],
      removed: [],
    });

    const local = [{ from: "teh", to: "the" }];
    const remote = [
      { from: "teh", to: "the" },
      { from: "adn", to: "and" },
    ];
    expect(unionMergeReplacements(local, remote)).toEqual(remote);
    expect(diffReplacements(local, remote)).toEqual({
      added: [{ from: "adn", to: "and" }],
      removed: [],
    });
  });

  test("treats an edited replacement as removing the old row and adding the new row", () => {
    const previous = [{ from: "teh", to: "the" }];
    const next = [{ from: " TEH ", to: "The" }];
    expect(unionMergeReplacements(previous, next)).toEqual(previous);
    expect(diffReplacements(previous, next)).toEqual({
      added: next,
      removed: previous,
    });
  });

  test("removes the prior replacement before adding its edited value", async () => {
    localStorage.setItem(
      "looper.sync.replacementIds",
      JSON.stringify({ teh: "replacement-old" }),
    );
    const rawClient = fakeClient();
    rawClient.mutation
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("replacement-new");
    const client = rawClient as unknown as ConvexClient;

    await pushReplacementsDiff(
      client,
      [{ from: "teh", to: "the" }],
      [{ from: "teh", to: "The" }],
    );

    expect(rawClient.mutation.mock.calls).toEqual([
      [backendApi.dictation.replacements.remove, { id: "replacement-old" }],
      [
        backendApi.dictation.replacements.add,
        { source: "teh", destination: "The" },
      ],
    ]);
    expect(
      JSON.parse(localStorage.getItem("looper.sync.replacementIds") ?? "{}"),
    ).toEqual({ teh: "replacement-new" });
  });

  test("appends remote-only snippets and never drops a local-only one", () => {
    const local = [{ trigger: "sig", expansion: "Best regards" }];
    const remote = [
      { trigger: "sig", expansion: "Best regards" },
      { trigger: "addr", expansion: "123 Main St" },
    ];
    expect(unionMergeSnippets(local, remote)).toEqual(remote);
    expect(unionMergeSnippets(local, [])).toEqual(local);
    expect(diffSnippets(local, remote)).toEqual({
      added: [{ trigger: "addr", expansion: "123 Main St" }],
      removed: [],
    });
    expect(diffSnippets(local, local)).toEqual({ added: [], removed: [] });
    expect(diffSnippets(remote, [remote[1]!])).toEqual({
      added: [],
      removed: [{ trigger: "sig", expansion: "Best regards" }],
    });
  });

  test("reconciles snippets by normalized trigger and replaces edited expansions", async () => {
    const previous = [{ trigger: "sig", expansion: "Regards" }];
    const next = [{ trigger: " SIG ", expansion: "Kind regards" }];
    expect(unionMergeSnippets(previous, next)).toEqual(previous);
    expect(diffSnippets(previous, next)).toEqual({
      added: next,
      removed: previous,
    });

    localStorage.setItem(
      "looper.sync.snippetIds",
      JSON.stringify({ sig: "snippet-old" }),
    );
    const rawClient = fakeClient();
    rawClient.mutation
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("snippet-new");

    await pushSnippetsDiff(
      rawClient as unknown as ConvexClient,
      previous,
      next,
    );

    expect(rawClient.mutation.mock.calls).toEqual([
      [backendApi.dictation.snippets.remove, { id: "snippet-old" }],
      [
        backendApi.dictation.snippets.add,
        { trigger: " SIG ", expansion: "Kind regards" },
      ],
    ]);
  });
});
