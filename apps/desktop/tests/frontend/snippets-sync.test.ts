import { describe, expect, test } from "vitest";
import { diffSnippets, unionMergeSnippets } from "../../src/data/snippets-sync";

describe("snippets-sync: union merge (pull-on-reconnect)", () => {
  test("keeps local order and appends remote-only snippets", () => {
    const local = [{ trigger: "sig", expansion: "Best regards" }];
    const remote = [
      { trigger: "sig", expansion: "Best regards" },
      { trigger: "addr", expansion: "123 Main St" },
    ];
    expect(unionMergeSnippets(local, remote)).toEqual([
      { trigger: "sig", expansion: "Best regards" },
      { trigger: "addr", expansion: "123 Main St" },
    ]);
  });

  test("is case-insensitive when de-duping by trigger", () => {
    const local = [{ trigger: "Sig", expansion: "local version" }];
    const remote = [
      { trigger: "sig", expansion: "remote version" },
      { trigger: "addr", expansion: "123 Main St" },
    ];
    expect(unionMergeSnippets(local, remote)).toEqual([
      { trigger: "Sig", expansion: "local version" },
      { trigger: "addr", expansion: "123 Main St" },
    ]);
  });

  test("never drops a local-only snippet", () => {
    const local = [{ trigger: "local-only", expansion: "kept" }];
    expect(unionMergeSnippets(local, [])).toEqual(local);
  });
});

describe("snippets-sync: diff (push-on-change)", () => {
  test("detects additions and removals against the last-pushed snapshot", () => {
    const previous = [
      { trigger: "sig", expansion: "Best regards" },
      { trigger: "addr", expansion: "123 Main St" },
    ];
    const next = [
      { trigger: "addr", expansion: "123 Main St" },
      { trigger: "meet", expansion: "https://meet.example.com" },
    ];
    expect(diffSnippets(previous, next)).toEqual({
      added: [{ trigger: "meet", expansion: "https://meet.example.com" }],
      removed: [{ trigger: "sig", expansion: "Best regards" }],
    });
  });

  test("no-op when nothing changed", () => {
    const snapshot = [{ trigger: "sig", expansion: "Best regards" }];
    expect(diffSnippets(snapshot, snapshot)).toEqual({
      added: [],
      removed: [],
    });
  });

  test("a changed expansion is treated as remove-old + add-new", () => {
    const previous = [{ trigger: "sig", expansion: "Best regards" }];
    const next = [{ trigger: "sig", expansion: "Kind regards" }];
    expect(diffSnippets(previous, next)).toEqual({
      added: [{ trigger: "sig", expansion: "Kind regards" }],
      removed: [{ trigger: "sig", expansion: "Best regards" }],
    });
  });

  test("a plain addition leaves existing snippets untouched", () => {
    const previous = [{ trigger: "sig", expansion: "Best regards" }];
    const next = [
      { trigger: "sig", expansion: "Best regards" },
      { trigger: "addr", expansion: "123 Main St" },
    ];
    expect(diffSnippets(previous, next)).toEqual({
      added: [{ trigger: "addr", expansion: "123 Main St" }],
      removed: [],
    });
  });
});
