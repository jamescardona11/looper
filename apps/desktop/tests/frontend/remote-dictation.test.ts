import { describe, expect, test, vi } from "vitest";
import { startRemoteDictationConsumer } from "../../src/data/remote-dictation";

type Pending = { text: string; pendingTextAt: number; seq: number } | null;

class FakeRemoteDictationClient {
  mutations: Array<{ name: unknown; args: Record<string, unknown> }> = [];
  onUpdateArgs: Record<string, unknown> | null = null;
  callback: ((pending: Pending) => void) | null = null;
  unsubscribed = false;
  closed = false;

  async mutation(
    name: unknown,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.mutations.push({ name, args });
    return {};
  }

  onUpdate(
    _name: unknown,
    args: Record<string, unknown>,
    callback: (pending: Pending) => void,
  ): () => void {
    this.onUpdateArgs = args;
    this.callback = callback;
    return () => {
      this.unsubscribed = true;
    };
  }

  close(): void {
    this.closed = true;
  }
}

describe("remote dictation consumer", () => {
  test("registers, inserts pending text, and acknowledges the same seq", async () => {
    const client = new FakeRemoteDictationClient();
    const ensureSession = vi.fn();
    const insertText = vi.fn(async () => {});

    const cleanup = startRemoteDictationConsumer({
      convexUrl: "http://127.0.0.1:3210",
      clientFactory: () => client,
      ensureSession,
      insertText,
      sessionId: "desktop-test-session",
      sessionName: "Desktop Test",
    });

    expect(ensureSession).toHaveBeenCalledWith(client);
    expect(client.mutations[0]?.args).toEqual({
      sessionId: "desktop-test-session",
      name: "Desktop Test",
    });
    expect(client.onUpdateArgs).toEqual({ sessionId: "desktop-test-session" });

    client.callback?.({
      text: "remote fixture inserted",
      pendingTextAt: Date.now(),
      seq: 7,
    });
    await vi.waitFor(() => {
      expect(insertText).toHaveBeenCalledWith("remote fixture inserted");
    });

    expect(client.mutations.at(-1)?.args).toEqual({
      sessionId: "desktop-test-session",
      seq: 7,
    });

    cleanup();
    expect(client.unsubscribed).toBe(true);
    expect(client.closed).toBe(true);
  });

  test("retries registration when anonymous auth is not ready on first attempt", async () => {
    vi.useFakeTimers();
    const client = new FakeRemoteDictationClient();
    const ensureSession = vi.fn();
    let registerAttempts = 0;
    const originalMutation = client.mutation.bind(client);
    client.mutation = vi.fn(async (name, args) => {
      if (
        args.sessionId === "desktop-test-session" &&
        args.name === "Desktop Test"
      ) {
        registerAttempts += 1;
        if (registerAttempts === 1) throw new Error("Must be signed in");
      }
      return originalMutation(name, args);
    });

    const cleanup = startRemoteDictationConsumer({
      convexUrl: "http://127.0.0.1:3210",
      clientFactory: () => client,
      ensureSession,
      insertText: async () => {},
      sessionId: "desktop-test-session",
      sessionName: "Desktop Test",
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(registerAttempts).toBe(2);
    expect(client.mutations[0]?.args).toEqual({
      sessionId: "desktop-test-session",
      name: "Desktop Test",
    });

    cleanup();
    vi.useRealTimers();
  });
});
