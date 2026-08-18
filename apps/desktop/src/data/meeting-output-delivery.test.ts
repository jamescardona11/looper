// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const backendApi = vi.hoisted(() => ({
  meetings: {
    sessions: {
      claimConfirmedMarkdownOutput: "meetings:claimOutput",
      completeMarkdownOutputDelivery: "meetings:completeOutput",
    },
  },
}));
const client = vi.hoisted(() => ({ mutation: vi.fn(), close: vi.fn() }));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@looper/backend/convex/_generated/api", () => ({ api: backendApi }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./convex-auth", () => ({
  createConvexClient: () => client,
  ensureAnonymousSession: vi.fn(),
}));

import { startConfirmedMeetingOutputDelivery } from "./meeting-output-delivery";

async function flushDelivery() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("confirmed meeting output delivery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    client.mutation.mockReset();
    client.close.mockReset();
    invoke.mockReset();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("claims, writes, and confirms one Markdown output", async () => {
    client.mutation
      .mockResolvedValueOnce({
        outputId: "output-1",
        meetingId: "meeting-1",
        preview: "# Decision",
      })
      .mockResolvedValueOnce(undefined);
    invoke.mockResolvedValue("/notes/meeting-1.md");

    const stop = startConfirmedMeetingOutputDelivery();
    await flushDelivery();

    expect(client.mutation).toHaveBeenNthCalledWith(
      1,
      backendApi.meetings.sessions.claimConfirmedMarkdownOutput,
      { claimId: "00000000-0000-4000-8000-000000000001" },
    );
    expect(invoke).toHaveBeenCalledWith("mirror_confirmed_meeting_output", {
      outputId: "output-1",
      meetingId: "meeting-1",
      content: "# Decision",
    });
    expect(client.mutation).toHaveBeenNthCalledWith(
      2,
      backendApi.meetings.sessions.completeMarkdownOutputDelivery,
      {
        outputId: "output-1",
        claimId: "00000000-0000-4000-8000-000000000001",
        delivered: true,
      },
    );

    stop();
    await flushDelivery();
    expect(client.close).toHaveBeenCalledOnce();
  });

  test("marks a claimed output undelivered after a local write failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    client.mutation
      .mockResolvedValueOnce({
        outputId: "output-2",
        meetingId: "meeting-2",
        preview: "# Notes",
      })
      .mockResolvedValueOnce(undefined);
    invoke.mockRejectedValue(new Error("disk full"));

    const stop = startConfirmedMeetingOutputDelivery();
    await flushDelivery();

    expect(client.mutation).toHaveBeenLastCalledWith(
      backendApi.meetings.sessions.completeMarkdownOutputDelivery,
      {
        outputId: "output-2",
        claimId: "00000000-0000-4000-8000-000000000001",
        delivered: false,
      },
    );
    stop();
    await flushDelivery();
  });
});
