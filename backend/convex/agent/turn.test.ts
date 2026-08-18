import { describe, expect, it } from "vitest";
import {
  buildModelMessages,
  type HistoryEntry,
  latestTurnRequiresMemorySearch,
  runAssistantStream,
  shouldFlushPatch,
} from "./turn";

// Characterization: these pin the observable text-only message preparation and
// the 250ms streaming patch cadence.

describe("buildModelMessages", () => {
  it("passes private text turns through unchanged", () => {
    const history: HistoryEntry[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    const out = buildModelMessages(history);
    expect(out).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  it("preserves turn order", () => {
    const history: HistoryEntry[] = [
      { role: "user", content: "first recording question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "follow-up" },
    ];
    const out = buildModelMessages(history);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.map((m) => m.content)).toEqual([
      "first recording question",
      "first answer",
      "follow-up",
    ]);
  });
});

describe("latestTurnRequiresMemorySearch", () => {
  it("requires retrieval for a scoped user turn", () => {
    expect(
      latestTurnRequiresMemorySearch([
        { role: "assistant", content: "previous answer" },
        { role: "user", content: "summarize it", memoryScope: "notes" },
      ]),
    ).toBe(true);
  });

  it("does not force retrieval for unscoped or completed turns", () => {
    expect(latestTurnRequiresMemorySearch([{ role: "user", content: "hello" }])).toBe(false);
    expect(
      latestTurnRequiresMemorySearch([
        { role: "user", content: "find it", memoryScope: "notes" },
        { role: "assistant", content: "done" },
      ]),
    ).toBe(false);
  });
});

describe("shouldFlushPatch (250ms cadence)", () => {
  const INTERVAL = 250;

  it("does not flush before the interval has elapsed", () => {
    expect(shouldFlushPatch(1100, 1000, INTERVAL)).toBe(false);
  });

  it("does not flush exactly at the boundary (strictly greater-than)", () => {
    expect(shouldFlushPatch(1250, 1000, INTERVAL)).toBe(false);
  });

  it("flushes once past the interval", () => {
    expect(shouldFlushPatch(1251, 1000, INTERVAL)).toBe(true);
  });

  it("flushes on the very first chunk (lastPatchAt = 0)", () => {
    // reply.ts initializes lastPatchAt = 0, so any positive Date.now() flushes.
    expect(shouldFlushPatch(Date.now(), 0, INTERVAL)).toBe(true);
  });
});

async function* chunks(...values: string[]): AsyncIterable<string> {
  for (const value of values) yield value;
}

describe("runAssistantStream", () => {
  it("patches on cadence, captures metadata, and finalizes once", async () => {
    const patches: string[] = [];
    const finalized: unknown[] = [];
    const times = [1000, 1100, 1300];

    const result = await runAssistantStream({
      textStream: chunks("a", "b", "c"),
      patchIntervalMs: 250,
      now: () => times.shift() ?? 1300,
      patch: async (content) => {
        patches.push(content);
        return { canceled: false };
      },
      loadToolCalls: async () => [{ toolName: "search" }, { toolName: "weather" }],
      loadReasoning: async () => "thinking",
      finalize: async (input) => {
        finalized.push(input);
      },
    });

    expect(patches).toEqual(["a", "abc"]);
    expect(finalized).toEqual([
      {
        content: "abc",
        toolCalls: JSON.stringify([{ name: "search" }, { name: "weather" }]),
        reasoning: "thinking",
      },
    ]);
    expect(result).toEqual({ canceled: false, content: "abc", toolCallCount: 2 });
  });

  it("finalizes partial content and skips metadata after cancellation", async () => {
    let metadataLoads = 0;
    const finalized: unknown[] = [];

    const result = await runAssistantStream({
      textStream: chunks("partial", "ignored"),
      patchIntervalMs: 250,
      now: () => 1000,
      patch: async () => ({ canceled: true }),
      loadToolCalls: async () => {
        metadataLoads += 1;
        return [];
      },
      loadReasoning: async () => {
        metadataLoads += 1;
        return undefined;
      },
      finalize: async (input) => {
        finalized.push(input);
      },
    });

    expect(metadataLoads).toBe(0);
    expect(finalized).toEqual([{ content: "partial" }]);
    expect(result).toEqual({ canceled: true, content: "partial", toolCallCount: 0 });
  });

  it("ignores unavailable optional metadata", async () => {
    const finalized: unknown[] = [];

    await runAssistantStream({
      textStream: chunks("answer"),
      patchIntervalMs: 250,
      now: () => 1000,
      patch: async () => ({ canceled: false }),
      loadToolCalls: async () => {
        throw new Error("not supported");
      },
      loadReasoning: async () => {
        throw new Error("not supported");
      },
      finalize: async (input) => {
        finalized.push(input);
      },
    });

    expect(finalized).toEqual([{ content: "answer" }]);
  });

  it("reports partial content and leaves error finalization to the caller", async () => {
    const error = new Error("stream failed");
    const seen: string[] = [];
    let finalized = false;

    async function* failingStream(): AsyncIterable<string> {
      yield "partial";
      throw error;
    }

    await expect(
      runAssistantStream({
        textStream: failingStream(),
        patchIntervalMs: 250,
        now: () => 1000,
        patch: async () => ({ canceled: false }),
        loadToolCalls: async () => [],
        loadReasoning: async () => undefined,
        finalize: async () => {
          finalized = true;
        },
        onContent: (content) => seen.push(content),
      }),
    ).rejects.toBe(error);

    expect(seen).toEqual(["partial"]);
    expect(finalized).toBe(false);
  });
});
