// @vitest-environment jsdom

import type { ConvexClient } from "convex/browser";
import { beforeEach, describe, expect, test, vi } from "vitest";

const backendApi = vi.hoisted(() => ({
  dictation: {
    settings: {
      get: "settings:get",
      update: "settings:update",
    },
    transcriptions: {
      record: "transcriptions:record",
    },
  },
}));
const invoke = vi.hoisted(() => vi.fn());
const getTranscriptions = vi.hoisted(() => vi.fn());
const subscribeTranscriptionEvents = vi.hoisted(() => vi.fn());

vi.mock("@looper/backend/convex/_generated/api", () => ({ api: backendApi }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./transcription", () => ({
  getTranscriptions,
  subscribeTranscriptionEvents,
}));

import {
  isHistorySyncOptedIn,
  pushUnsyncedBacklog,
  setHistorySyncOptedIn,
  startHistorySync,
} from "./history-sync";
import { pullModeRules, pushModeRules } from "./settings-sync";
import type { ModeRule, TranscriptionRecord } from "../types";

function fakeClient() {
  return {
    mutation: vi.fn(),
    query: vi.fn(),
  };
}

function transcription(
  overrides: Partial<TranscriptionRecord> = {},
): TranscriptionRecord {
  return {
    id: "record-1",
    timestamp: "2026-08-16T12:00:00.000Z",
    text: "First local transcript",
    audio_path: "/tmp/record-1.wav",
    audio_available: true,
    status: "success",
    llm_cleaned: false,
    speech_model: "parakeet",
    word_count: 3,
    audio_duration_seconds: 2,
    synced: false,
    ...overrides,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("settings sync", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  test("applies only a newer remote mode-rule snapshot", async () => {
    const localRules = [{ id: "local" }] as ModeRule[];
    const remoteRules = [{ id: "remote" }] as ModeRule[];
    invoke.mockResolvedValueOnce(localRules).mockResolvedValueOnce(remoteRules);
    const rawClient = fakeClient();
    rawClient.query.mockResolvedValue({
      data: { mode_rules: remoteRules },
      version: 4,
    });

    await expect(
      pullModeRules(rawClient as unknown as ConvexClient),
    ).resolves.toEqual(remoteRules);

    expect(invoke).toHaveBeenNthCalledWith(1, "get_mode_rules");
    expect(invoke).toHaveBeenNthCalledWith(2, "set_mode_rules", {
      modeRules: remoteRules,
    });
    expect(localStorage.getItem("looper.sync.settingsVersion")).toBe("4");

    invoke.mockReset();
    invoke.mockResolvedValue(localRules);
    rawClient.query.mockResolvedValue({
      data: { mode_rules: remoteRules },
      version: 4,
    });

    await expect(
      pullModeRules(rawClient as unknown as ConvexClient),
    ).resolves.toEqual(localRules);
    expect(invoke).toHaveBeenCalledOnce();
  });

  test("skips unchanged rules and records the version of a changed snapshot", async () => {
    const previous = [{ id: "rule-1" }] as ModeRule[];
    const next = [{ id: "rule-2" }] as ModeRule[];
    const rawClient = fakeClient();
    rawClient.mutation.mockResolvedValue(undefined);
    rawClient.query.mockResolvedValue({
      data: { mode_rules: next },
      version: 7,
    });
    const client = rawClient as unknown as ConvexClient;

    await pushModeRules(client, previous, previous);
    expect(rawClient.mutation).not.toHaveBeenCalled();

    await pushModeRules(client, previous, next);
    expect(rawClient.mutation).toHaveBeenCalledWith(
      backendApi.dictation.settings.update,
      { data: { mode_rules: next } },
    );
    expect(localStorage.getItem("looper.sync.settingsVersion")).toBe("7");
  });
});

describe("history sync", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    getTranscriptions.mockReset();
    subscribeTranscriptionEvents.mockReset();
  });

  test("keeps history local until the user opts in", async () => {
    const rawClient = fakeClient();
    getTranscriptions.mockResolvedValue([transcription()]);

    expect(isHistorySyncOptedIn()).toBe(false);
    await pushUnsyncedBacklog(rawClient as unknown as ConvexClient);
    expect(getTranscriptions).not.toHaveBeenCalled();

    setHistorySyncOptedIn(true);
    expect(isHistorySyncOptedIn()).toBe(true);
    await pushUnsyncedBacklog(rawClient as unknown as ConvexClient);

    expect(rawClient.mutation).toHaveBeenCalledWith(
      backendApi.dictation.transcriptions.record,
      {
        text: "First local transcript",
        source: "local",
        sourceId: "record-1",
        occurredAt: Date.parse("2026-08-16T12:00:00.000Z"),
      },
    );
    expect(invoke).toHaveBeenCalledWith("mark_transcription_synced", {
      id: "record-1",
    });
  });

  test("skips already-synced, failed, and blank rows in the backlog", async () => {
    setHistorySyncOptedIn(true);
    getTranscriptions.mockResolvedValue([
      transcription({ id: "record-1", text: "First local transcript" }),
      transcription({ id: "record-2", synced: true, text: "Already pushed" }),
      transcription({ id: "record-3", status: "error", text: "Failed row" }),
      transcription({ id: "record-4", text: "   " }),
    ]);
    const rawClient = fakeClient();
    rawClient.mutation.mockResolvedValue(undefined);

    await pushUnsyncedBacklog(rawClient as unknown as ConvexClient);

    expect(rawClient.mutation).toHaveBeenCalledOnce();
    expect(rawClient.mutation).toHaveBeenCalledWith(
      backendApi.dictation.transcriptions.record,
      expect.objectContaining({ sourceId: "record-1" }),
    );
    expect(invoke.mock.calls).toEqual([
      ["mark_transcription_synced", { id: "record-1" }],
    ]);
  });

  test("pushes eligible completion events and disposes their native listener", async () => {
    let onComplete:
      ((payload: { record: TranscriptionRecord | null }) => void) | undefined;
    const unlisten = vi.fn();
    subscribeTranscriptionEvents.mockImplementation((handlers) => {
      onComplete = handlers.onComplete;
      return [Promise.resolve(unlisten)];
    });
    const rawClient = fakeClient();
    rawClient.mutation.mockResolvedValue(undefined);
    invoke.mockResolvedValue(undefined);
    setHistorySyncOptedIn(true);

    const stop = startHistorySync(rawClient as unknown as ConvexClient);
    onComplete?.({ record: transcription({ id: "record-2" }) });
    await flushAsyncWork();

    expect(rawClient.mutation).toHaveBeenCalledOnce();
    stop();
    await flushAsyncWork();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
