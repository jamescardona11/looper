// @vitest-environment jsdom

import type { ConvexClient } from "convex/browser";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSyncSessionStore } from "../sync-session-store";
import type { Viewer } from "../../../data/convex-auth";

function createDependencies() {
  const client = { close: vi.fn().mockResolvedValue(undefined) };
  let viewerListener: ((viewer: Viewer | null) => void) | undefined;
  const stopViewer = vi.fn();
  const dependencies = {
    createClient: vi.fn(
      (): ConvexClient | null => client as unknown as ConvexClient,
    ),
    ensureSession: vi.fn(),
    watchViewer: vi.fn((_client, listener) => {
      viewerListener = listener;
      return stopViewer;
    }),
    requestOtp: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    readHistoryOptIn: vi.fn(() => false),
    writeHistoryOptIn: vi.fn(),
  };
  return {
    client,
    dependencies,
    emitViewer: (viewer: Viewer | null) => viewerListener?.(viewer),
    stopViewer,
  };
}

describe("sync session store", () => {
  beforeEach(() => vi.clearAllMocks());

  test("starts on first subscriber and closes after the last one leaves", () => {
    const { client, dependencies, emitViewer, stopViewer } =
      createDependencies();
    const store = createSyncSessionStore(dependencies);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    expect(dependencies.ensureSession).toHaveBeenCalledWith(client);

    emitViewer({
      userId: "person-1",
      email: "person@example.com",
      isAnonymous: false,
    });
    expect(store.getSnapshot().auth).toEqual({
      status: "authenticated",
      userId: "person-1",
      email: "person@example.com",
    });

    unsubscribe();
    expect(stopViewer).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
  });

  test("publishes pending and error states around account actions", async () => {
    const { dependencies } = createDependencies();
    const store = createSyncSessionStore(dependencies);
    const states: Array<{ pending: boolean; error: string | null }> = [];
    store.subscribe(() => {
      const { pending, error } = store.getSnapshot();
      states.push({ pending, error });
    });
    dependencies.requestOtp.mockRejectedValueOnce(
      new Error("Code unavailable"),
    );

    await expect(store.requestOtp("person@example.com")).rejects.toThrow(
      "Code unavailable",
    );

    expect(states).toContainEqual({ pending: true, error: null });
    expect(store.getSnapshot()).toMatchObject({
      pending: false,
      error: "Code unavailable",
    });
  });

  test("keeps the history preference explicit and reports unavailable builds", () => {
    const { dependencies } = createDependencies();
    dependencies.createClient.mockReturnValue(null);
    dependencies.readHistoryOptIn.mockReturnValue(true);
    const store = createSyncSessionStore(dependencies);
    const unsubscribe = store.subscribe(vi.fn());

    expect(store.getSnapshot()).toMatchObject({
      available: false,
      auth: { status: "unauthenticated" },
      historyOptIn: true,
    });

    store.setHistoryOptIn(false);
    expect(dependencies.writeHistoryOptIn).toHaveBeenCalledWith(false);
    expect(store.getSnapshot().historyOptIn).toBe(false);
    unsubscribe();
  });
});
