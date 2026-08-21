// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

const listeners = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
);
const client = vi.hoisted(() => ({ mutation: vi.fn(), close: vi.fn() }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (name: string, handler: (event: { payload: unknown }) => void) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
  ),
}));

vi.mock("../convex-auth", () => ({
  createConvexClient: () => client,
  ensureAnonymousSession: vi.fn(),
}));

import {
  setLiveMeetingSharingEnabled,
  startLiveMeetingPublisher,
} from "../live-meeting";

async function flushPublisher() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  listeners.clear();
  client.mutation.mockReset();
  client.close.mockReset();
  localStorage.clear();
});

describe("Live Meeting publisher", () => {
  test("does not publish transcript text before opt-in", async () => {
    const stop = startLiveMeetingPublisher();
    await flushPublisher();

    listeners.get("meeting:transcript_update")?.({
      payload: {
        meeting_id: "meeting-private",
        source: "you",
        text: "Local-only transcript",
        start_ms: 1,
        end_ms: 2,
        is_final: true,
      },
    });
    await flushPublisher();

    expect(client.mutation).not.toHaveBeenCalled();
    stop();
    await flushPublisher();
  });

  test("publishes ordered transcript text only after explicit opt-in", async () => {
    client.mutation
      .mockResolvedValueOnce({ nextSequence: 1 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ nextSequence: 2 });
    setLiveMeetingSharingEnabled(true);
    const stop = startLiveMeetingPublisher();
    await flushPublisher();

    listeners.get("meeting:transcript_update")?.({
      payload: {
        meeting_id: "meeting-1",
        source: "them",
        text: "We decided to ship Friday.",
        start_ms: 100,
        end_ms: 200,
        is_final: true,
      },
    });
    await flushPublisher();

    expect(client.mutation).toHaveBeenCalledTimes(3);
    expect(client.mutation.mock.calls[0]?.[1]).toMatchObject({
      meetingId: "meeting-1",
      sharingEnabled: true,
    });
    expect(client.mutation.mock.calls[2]?.[1]).toMatchObject({
      meetingId: "meeting-1",
      sequence: 1,
      timestampMs: 200,
      status: "final",
      text: "We decided to ship Friday.",
    });
    stop();
  });

  test("pauses an active publish stream immediately when opt-in is disabled", async () => {
    client.mutation
      .mockResolvedValueOnce({ nextSequence: 1 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ nextSequence: 2 })
      .mockResolvedValueOnce(undefined);
    setLiveMeetingSharingEnabled(true);
    const stop = startLiveMeetingPublisher();
    await flushPublisher();
    listeners.get("meeting:transcript_update")?.({
      payload: {
        meeting_id: "meeting-1",
        source: "you",
        text: "Private text is only shared while enabled.",
        start_ms: 1,
        end_ms: 2,
        is_final: false,
      },
    });
    await flushPublisher();

    setLiveMeetingSharingEnabled(false);
    await flushPublisher();

    expect(client.mutation.mock.calls[3]?.[1]).toMatchObject({
      meetingId: "meeting-1",
      state: "paused",
      sharingEnabled: false,
    });
    stop();
    await flushPublisher();
  });
});
