import { beforeEach, describe, expect, test, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const getTranscriptionsMock = vi.hoisted(() => vi.fn());
const subscribeTranscriptionEventsMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../../src/data/transcription", () => ({
  getTranscriptions: getTranscriptionsMock,
  subscribeTranscriptionEvents: subscribeTranscriptionEventsMock,
}));

const { isHistorySyncOptedIn, pushUnsyncedBacklog, setHistorySyncOptedIn } =
  await import("../../src/data/history-sync");

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  });
}

function record(overrides: Record<string, unknown>) {
  return {
    id: "1",
    timestamp: "2024-01-01T00:00:00.000Z",
    status: "success",
    synced: false,
    text: "Ship the transcript.",
    ...overrides,
  };
}

describe("history-sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installLocalStorage();
    invokeMock.mockReset();
    getTranscriptionsMock.mockReset();
    subscribeTranscriptionEventsMock.mockReset();
  });

  test("keeps local history sync opt-in explicit", () => {
    expect(isHistorySyncOptedIn()).toBe(false);

    setHistorySyncOptedIn(true);
    expect(isHistorySyncOptedIn()).toBe(true);

    setHistorySyncOptedIn(false);
    expect(isHistorySyncOptedIn()).toBe(false);
  });

  test("does not read or push local history while opt-in is disabled", async () => {
    const client = { mutation: vi.fn() };

    await pushUnsyncedBacklog(client as never);

    expect(getTranscriptionsMock).not.toHaveBeenCalled();
    expect(client.mutation).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("pushes only successful unsynced text rows and marks them synced", async () => {
    setHistorySyncOptedIn(true);
    getTranscriptionsMock.mockResolvedValue([
      record({ id: "10", text: "First transcript." }),
      record({ id: "11", synced: true, text: "Already pushed." }),
      record({ id: "12", status: "failed", text: "Failed row." }),
      record({ id: "13", text: "   " }),
    ]);
    const client = { mutation: vi.fn().mockResolvedValue(null) };

    await pushUnsyncedBacklog(client as never);

    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(client.mutation.mock.calls[0]?.[1]).toEqual({
      text: "First transcript.",
      source: "local",
      sourceId: "10",
      occurredAt: 1_704_067_200_000,
    });
    expect(invokeMock).toHaveBeenCalledWith("mark_transcription_synced", {
      id: "10",
    });
  });
});
