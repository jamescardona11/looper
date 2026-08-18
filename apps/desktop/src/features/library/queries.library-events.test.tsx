// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryEventHandlers } from "../../data/library";
import type { LibraryItem } from "../../types";
import { libraryKeys, useLibraryItems } from "./queries";

const events = vi.hoisted(() => ({
  handlers: null as LibraryEventHandlers | null,
}));
const release = vi.hoisted(() => vi.fn());

const pendingItem = vi.hoisted<LibraryItem>(() => ({
  id: "item-1",
  name: "Recording",
  status: { type: "pending" },
  created_at: "2026-08-17T00:00:00Z",
  tags: [],
  kind: "import",
  audio_path: "/tmp/audio.wav",
  source_path: "/tmp/source.wav",
  store_original: true,
  duration_seconds: 1,
  file_size_bytes: 10,
  original_format: "wav",
  llm_cleanup_enabled: false,
  denoise_enabled: false,
  speech_model: "parakeet",
  show_timestamps: false,
  detect_speakers: false,
}));

vi.mock("../../data/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../data/library")>()),
  getLibraryItemsPage: vi.fn(async () => ({
    items: [pendingItem],
    has_more: false,
  })),
  subscribeLibraryEvents: vi.fn(async (handlers: LibraryEventHandlers) => {
    events.handlers = handlers;
    return release;
  }),
}));

afterEach(() => {
  cleanup();
  events.handlers = null;
  release.mockClear();
});

describe("useLibraryItems events", () => {
  it("projects streaming updates into the active cache and releases listeners", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const filter = { search: "recording" };
    const { result, unmount } = renderHook(() => useLibraryItems(filter), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.data?.pages[0]?.items).toHaveLength(1),
    );
    await waitFor(() => expect(events.handlers).toBeTruthy());
    act(() => {
      events.handlers?.transcriptionProgress({
        id: "item-1",
        progress: 0.5,
        current_chunk: 1,
        total_chunks: 2,
        chunk_text: "Visible now",
      });
    });

    const cached = client.getQueryData<{
      pages: Array<{ items: LibraryItem[] }>;
    }>(libraryKeys.list(filter));
    expect(cached?.pages[0]?.items[0]).toMatchObject({
      transcript: "Visible now",
      status: { type: "transcribing", progress: 0.5 },
    });

    unmount();
    expect(release).toHaveBeenCalledOnce();
  });
});
