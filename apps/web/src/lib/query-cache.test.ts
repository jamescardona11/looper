import { beforeEach, describe, expect, it } from "vitest";
import { browserQueryCache } from "./query-cache";

describe("browserQueryCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips values without changing the provider-owned key", () => {
    browserQueryCache.write("qc:agent.messages|{}", '{"messages":[]}');

    expect(browserQueryCache.read("qc:agent.messages|{}")).toBe('{"messages":[]}');
  });

  it("returns null for a missing key", () => {
    expect(browserQueryCache.read("qc:missing")).toBeNull();
  });
});
