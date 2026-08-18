import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { MEMORY_SOURCES, searchMemory } from "./memory";

describe("local memory native gateway", () => {
  beforeEach(() => invoke.mockReset());

  test("exposes every native memory source", () => {
    expect(MEMORY_SOURCES).toEqual(["dictation", "library", "meeting"]);
  });

  test("passes the complete search filter under the native filter key", async () => {
    invoke.mockResolvedValue([]);
    const filter = {
      query: "design review",
      sources: ["meeting" as const],
      since_ms: 1_700_000_000_000,
      app_id: "com.example.editor",
      limit: 15,
    };

    await expect(searchMemory(filter)).resolves.toEqual([]);
    expect(invoke).toHaveBeenCalledWith("search_memory", { filter });
  });
});
