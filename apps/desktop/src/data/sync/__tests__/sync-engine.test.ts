// @vitest-environment jsdom

import type { ConvexClient } from "convex/browser";
import { beforeEach, describe, expect, test, vi } from "vitest";

const listen = vi.hoisted(() => vi.fn());
const createConvexClient = vi.hoisted(() => vi.fn());
const ensureAnonymousSession = vi.hoisted(() => vi.fn());
const subscribeViewer = vi.hoisted(() => vi.fn());
const pullAndMergeDictionary = vi.hoisted(() => vi.fn());
const pushDictionaryDiff = vi.hoisted(() => vi.fn());
const pushReplacementsDiff = vi.hoisted(() => vi.fn());
const pullAndMergeSnippets = vi.hoisted(() => vi.fn());
const pushSnippetsDiff = vi.hoisted(() => vi.fn());
const pullModeRules = vi.hoisted(() => vi.fn());
const pushModeRules = vi.hoisted(() => vi.fn());
const pushUnsyncedBacklog = vi.hoisted(() => vi.fn());
const startHistorySync = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("../convex-auth", () => ({
  createConvexClient,
  ensureAnonymousSession,
  subscribeViewer,
}));
vi.mock("../dictionary-sync", () => ({
  pullAndMergeDictionary,
  pushDictionaryDiff,
  pushReplacementsDiff,
}));
vi.mock("../snippets-sync", () => ({
  pullAndMergeSnippets,
  pushSnippetsDiff,
}));
vi.mock("../settings-sync", () => ({ pullModeRules, pushModeRules }));
vi.mock("../history-sync", () => ({
  pushUnsyncedBacklog,
  startHistorySync,
}));

import { startSyncEngine } from "../sync-engine";
import type { Viewer } from "../convex-auth";

type ViewerListener = (viewer: Viewer | null) => void;
type SettingsListener = (event: {
  payload: {
    dictionary: string[];
    replacements: Array<{ from: string; to: string }>;
    user_snippets: Array<{ trigger: string; expansion: string }>;
    mode_rules: Array<{ id: string }>;
  };
}) => void;

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("sync engine", () => {
  let viewerListener: ViewerListener;
  let settingsListener: SettingsListener;
  let unsubscribeViewer: ReturnType<typeof vi.fn>;
  let unlistenSettings: ReturnType<typeof vi.fn>;
  let stopHistory: ReturnType<typeof vi.fn>;
  let client: { close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    unsubscribeViewer = vi.fn();
    unlistenSettings = vi.fn();
    stopHistory = vi.fn();
    client = { close: vi.fn().mockResolvedValue(undefined) };
    createConvexClient.mockReturnValue(client as unknown as ConvexClient);
    subscribeViewer.mockImplementation((_client, listener) => {
      viewerListener = listener;
      return unsubscribeViewer;
    });
    listen.mockImplementation((_event, listener) => {
      settingsListener = listener;
      return Promise.resolve(unlistenSettings);
    });
    pullAndMergeDictionary.mockResolvedValue({
      dictionary: ["local"],
      replacements: [{ from: "teh", to: "the" }],
    });
    pullAndMergeSnippets.mockResolvedValue([
      { trigger: "sig", expansion: "Regards" },
    ]);
    pullModeRules.mockResolvedValue([{ id: "rule-1" }]);
    startHistorySync.mockReturnValue(stopHistory);
  });

  test("activates cloud workers only for an identified viewer", async () => {
    const stop = startSyncEngine();

    expect(ensureAnonymousSession).toHaveBeenCalledWith(client);
    viewerListener({ userId: "anonymous", isAnonymous: true });
    expect(pullAndMergeDictionary).not.toHaveBeenCalled();

    viewerListener({
      userId: "person-1",
      email: "person@example.com",
      isAnonymous: false,
    });
    await flushAsyncWork();

    expect(pullAndMergeDictionary).toHaveBeenCalledWith(client);
    expect(pullAndMergeSnippets).toHaveBeenCalledWith(client);
    expect(pullModeRules).toHaveBeenCalledWith(client);
    expect(pushUnsyncedBacklog).toHaveBeenCalledWith(client);
    expect(startHistorySync).toHaveBeenCalledWith(client);

    settingsListener({
      payload: {
        dictionary: ["next"],
        replacements: [{ from: "adress", to: "address" }],
        user_snippets: [{ trigger: "bye", expansion: "Goodbye" }],
        mode_rules: [{ id: "rule-2" }],
      },
    });

    expect(pushDictionaryDiff).toHaveBeenCalledWith(
      client,
      ["local"],
      ["next"],
    );
    expect(pushReplacementsDiff).toHaveBeenCalledWith(
      client,
      [{ from: "teh", to: "the" }],
      [{ from: "adress", to: "address" }],
    );
    expect(pushSnippetsDiff).toHaveBeenCalledWith(
      client,
      [{ trigger: "sig", expansion: "Regards" }],
      [{ trigger: "bye", expansion: "Goodbye" }],
    );
    expect(pushModeRules).toHaveBeenCalledWith(
      client,
      [{ id: "rule-1" }],
      [{ id: "rule-2" }],
    );

    viewerListener({ userId: "anonymous-2", isAnonymous: true });
    expect(stopHistory).toHaveBeenCalledOnce();
    expect(unlistenSettings).toHaveBeenCalledOnce();

    stop();
    expect(unsubscribeViewer).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
  });

  test("does not revive a session whose initial pull finished after sign-out", async () => {
    let finishDictionaryPull:
      | ((value: {
          dictionary: string[];
          replacements: Array<{ from: string; to: string }>;
        }) => void)
      | undefined;
    pullAndMergeDictionary.mockReturnValue(
      new Promise((resolve) => {
        finishDictionaryPull = resolve;
      }),
    );
    const stop = startSyncEngine();

    viewerListener({ userId: "person-1", isAnonymous: false });
    viewerListener({ userId: "anonymous-2", isAnonymous: true });
    finishDictionaryPull?.({ dictionary: [], replacements: [] });
    await flushAsyncWork();

    expect(startHistorySync).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    stop();
  });
});
