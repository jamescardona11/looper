// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  MeetingCaptureState,
  MeetingDetails,
  MeetingTranscriptUpdate,
} from "../../types";
import { libraryKeys, useMeetingCapture, useMeetingDetails } from "./queries";

const listeners = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
);
const meetingDetails = vi.hoisted<MeetingDetails>(() => ({
  library_item_id: "meeting-1",
  started_at: "2026-08-12T10:00:00Z",
  notes: "",
  notes_revision: 0,
  summary_status: "idle",
  system_audio_enabled: true,
  recovered: false,
  note_markers: [],
  live_transcript: [],
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (name: string, handler: (event: { payload: unknown }) => void) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
  ),
}));

vi.mock("../../data/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../data/library")>()),
  getMeetingDetails: vi.fn(async () => meetingDetails),
  getMeetingCaptureState: vi.fn(async (): Promise<MeetingCaptureState> => ({
    phase: "recording",
    id: "meeting-1",
    started_at: "2026-08-12T10:00:00Z",
    elapsed_seconds: 3,
    system_audio_enabled: true,
    capture_intent: "meeting",
    warning: null,
    error: null,
    last_note_marker: null,
    active_note_selection: null,
    active_important_moment: null,
    live_transcript: "Visible from snapshot",
    capture_health: {
      status: "healthy",
      audio_lag_ms: 0,
      last_audio_at: "2026-08-12T10:00:03Z",
      last_transcript_at: "2026-08-12T10:00:03Z",
    },
  })),
}));

afterEach(() => {
  cleanup();
  listeners.clear();
});

describe("useMeetingCapture", () => {
  test("hydrates an already-running capture without waiting for another event", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useMeetingCapture(), { wrapper });

    await waitFor(() => expect(result.current.data?.phase).toBe("recording"));
    expect(result.current.data?.live_transcript).toBe("Visible from snapshot");
    expect(listeners.has("meeting:capture_state")).toBe(true);
  });
});

describe("useMeetingDetails", () => {
  test("adds final live transcript updates to the visible meeting", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMeetingDetails("meeting-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    await waitFor(() =>
      expect(listeners.has("meeting:transcript_update")).toBe(true),
    );

    const update: MeetingTranscriptUpdate = {
      id: "segment-1",
      meeting_id: "meeting-1",
      source: "them",
      text: "Visible immediately",
      start_ms: 1_000,
      end_ms: 2_000,
      is_final: true,
    };
    act(() =>
      listeners.get("meeting:transcript_update")?.({ payload: update }),
    );

    expect(
      client.getQueryData<MeetingDetails>(
        libraryKeys.meetingDetails("meeting-1"),
      )?.live_transcript,
    ).toEqual([
      expect.objectContaining({ source: "them", text: "Visible immediately" }),
    ]);
  });

  test("does not duplicate a segment already delivered by details_changed", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useMeetingDetails("meeting-1"), { wrapper });

    await waitFor(() =>
      expect(listeners.has("meeting:details_changed")).toBe(true),
    );
    await waitFor(() =>
      expect(listeners.has("meeting:transcript_update")).toBe(true),
    );

    const segment = {
      id: "segment-1",
      source: "them" as const,
      text: "Only once",
      start_ms: 1_000,
      end_ms: 2_000,
    };
    act(() => {
      listeners.get("meeting:details_changed")?.({
        payload: { ...meetingDetails, live_transcript: [segment] },
      });
      listeners.get("meeting:transcript_update")?.({
        payload: {
          ...segment,
          meeting_id: "meeting-1",
          is_final: true,
        } satisfies MeetingTranscriptUpdate,
      });
    });

    expect(
      client.getQueryData<MeetingDetails>(
        libraryKeys.meetingDetails("meeting-1"),
      )?.live_transcript,
    ).toEqual([segment]);
  });
});
