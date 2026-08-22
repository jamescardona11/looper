// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  MemorySearchFilter,
  MemorySearchResult,
} from "../../../data/memory";
import { useMemorySearch } from "../queries";

const mocks = vi.hoisted(() => ({
  searchMemory: vi.fn(),
}));

vi.mock("../../../data/memory", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../data/memory")>();
  return { ...original, searchMemory: mocks.searchMemory };
});

afterEach(() => {
  mocks.searchMemory.mockReset();
});

describe("useMemorySearch", () => {
  test("keeps previous results visible while a new filter is fetching", async () => {
    const previousResult: MemorySearchResult = {
      id: "meeting-1",
      source: "meeting",
      title: "Weekly meeting",
      occurred_at: "2026-07-22T10:00:00Z",
      occurred_at_ms: 1_753_178_400_000,
      excerpt: "Pricing discussion",
      final_text: "Pricing discussion",
      score: 1,
      open_target: "library",
    };
    let resolveNext: ((value: MemorySearchResult[]) => void) | undefined;
    mocks.searchMemory
      .mockResolvedValueOnce([previousResult])
      .mockImplementationOnce(
        () =>
          new Promise<MemorySearchResult[]>((resolve) => {
            resolveNext = resolve;
          }),
      );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const initialFilter: MemorySearchFilter = {
      query: "pricing",
      sources: [],
      limit: 50,
    };
    const { result, rerender } = renderHook(
      ({ filter }) => useMemorySearch(filter, true),
      { initialProps: { filter: initialFilter }, wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([previousResult]));

    rerender({
      filter: { ...initialFilter, sources: ["meeting"] },
    });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toEqual([previousResult]);
    expect(result.current.isLoading).toBe(false);

    resolveNext?.([]);
  });
});
