// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const backendApi = vi.hoisted(() => ({
  dictation: {
    remote: {
      registerSession: "dictation:registerSession",
      getPendingDictation: "dictation:getPendingDictation",
      consumeDictation: "dictation:consumeDictation",
      endSession: "dictation:endSession",
    },
  },
}));

vi.mock("@looper/backend/convex/_generated/api", () => ({ api: backendApi }));

import { startRemoteDictationConsumer } from "./remote-dictation";

type Pending = {
  text: string;
  pendingTextAt: number;
  seq: number;
} | null;

function fakeClient() {
  let onPending: ((pending: Pending) => void) | null = null;
  const unsubscribe = vi.fn();
  return {
    close: vi.fn(),
    mutation: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn(
      (
        _name: unknown,
        _args: Record<string, unknown>,
        callback: (pending: Pending) => void,
      ) => {
        onPending = callback;
        return unsubscribe;
      },
    ),
    emitPending: (pending: Pending) => onPending?.(pending),
    unsubscribe,
  };
}

async function flushConsumer() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("remote dictation consumer", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("fails closed when no cloud endpoint is configured", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stop = startRemoteDictationConsumer({ convexUrl: "" });
    stop();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("remote dictation disabled"),
    );
  });

  test("registers, inserts, acknowledges, and closes one session", async () => {
    const client = fakeClient();
    const ensureSession = vi.fn();
    const insertText = vi.fn().mockResolvedValue(undefined);
    const stop = startRemoteDictationConsumer({
      convexUrl: "https://convex.example",
      clientFactory: () => client,
      ensureSession,
      insertText,
      sessionId: "desktop-1",
      sessionName: "Work Mac",
    });
    await flushConsumer();

    client.emitPending({
      text: "Paste this sentence",
      pendingTextAt: 100,
      seq: 7,
    });
    await flushConsumer();

    expect(ensureSession).toHaveBeenCalledWith(client);
    expect(client.mutation).toHaveBeenNthCalledWith(
      1,
      backendApi.dictation.remote.registerSession,
      { sessionId: "desktop-1", name: "Work Mac" },
    );
    expect(client.onUpdate).toHaveBeenCalledWith(
      backendApi.dictation.remote.getPendingDictation,
      { sessionId: "desktop-1" },
      expect.any(Function),
      expect.any(Function),
    );
    expect(insertText).toHaveBeenCalledWith("Paste this sentence");
    expect(client.mutation).toHaveBeenNthCalledWith(
      2,
      backendApi.dictation.remote.consumeDictation,
      { sessionId: "desktop-1", seq: 7 },
    );

    stop();
    expect(client.unsubscribe).toHaveBeenCalledOnce();
    expect(client.mutation).toHaveBeenLastCalledWith(
      backendApi.dictation.remote.endSession,
      { sessionId: "desktop-1" },
    );
    expect(client.close).toHaveBeenCalledOnce();
  });

  test("retries registration when the session is not authenticated yet", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = fakeClient();
    client.mutation
      .mockRejectedValueOnce(new Error("Must be signed in"))
      .mockResolvedValue(undefined);

    const stop = startRemoteDictationConsumer({
      convexUrl: "https://convex.example",
      clientFactory: () => client,
      ensureSession: vi.fn(),
      insertText: vi.fn().mockResolvedValue(undefined),
      sessionId: "desktop-1",
      sessionName: "Work Mac",
    });
    await flushConsumer();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(client.mutation.mock.calls.slice(0, 2)).toEqual([
      [
        backendApi.dictation.remote.registerSession,
        { sessionId: "desktop-1", name: "Work Mac" },
      ],
      [
        backendApi.dictation.remote.registerSession,
        { sessionId: "desktop-1", name: "Work Mac" },
      ],
    ]);

    stop();
  });

  test("does not start a second insertion while one is active", async () => {
    const client = fakeClient();
    let finishInsertion: (() => void) | undefined;
    const insertText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishInsertion = resolve;
        }),
    );
    const stop = startRemoteDictationConsumer({
      convexUrl: "https://convex.example",
      clientFactory: () => client,
      ensureSession: vi.fn(),
      insertText,
      sessionId: "desktop-1",
    });

    client.emitPending({ text: "First", pendingTextAt: 1, seq: 1 });
    client.emitPending({ text: "Second", pendingTextAt: 2, seq: 2 });
    expect(insertText).toHaveBeenCalledTimes(1);

    finishInsertion?.();
    await flushConsumer();
    stop();
  });
});
