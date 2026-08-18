import { beforeEach, describe, expect, test, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const { pullModeRules, pushModeRules } =
  await import("../../src/data/settings-sync");

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

const localRule = {
  id: "local-rule",
  name: "Local rule",
  trigger: "local",
  transform_preset: "cleanup",
};

const remoteRule = {
  id: "remote-rule",
  name: "Remote rule",
  trigger: "remote",
  transform_preset: "verbatim",
};

describe("settings-sync mode rules", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installLocalStorage();
    invokeMock.mockReset();
  });

  test("pullModeRules applies newer remote mode rules locally", async () => {
    invokeMock
      .mockResolvedValueOnce([localRule])
      .mockResolvedValueOnce([remoteRule]);
    const client = {
      query: vi.fn().mockResolvedValue({
        version: 2,
        data: { mode_rules: [remoteRule] },
      }),
    };

    await expect(pullModeRules(client as never)).resolves.toEqual([remoteRule]);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_mode_rules");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "set_mode_rules", {
      modeRules: [remoteRule],
    });
    expect(localStorage.getItem("looper.sync.settingsVersion")).toBe("2");
  });

  test("pushModeRules writes changed rules and records the saved version", async () => {
    const client = {
      mutation: vi.fn().mockResolvedValue(null),
      query: vi.fn().mockResolvedValue({
        version: 3,
        data: { mode_rules: [remoteRule] },
      }),
    };

    await pushModeRules(
      client as never,
      [localRule] as never,
      [remoteRule] as never,
    );

    expect(client.mutation.mock.calls[0]?.[1]).toEqual({
      data: { mode_rules: [remoteRule] },
    });
    expect(localStorage.getItem("looper.sync.settingsVersion")).toBe("3");
  });

  test("pushModeRules is a no-op when rules are unchanged", async () => {
    const client = {
      mutation: vi.fn(),
      query: vi.fn(),
    };

    await pushModeRules(
      client as never,
      [localRule] as never,
      [localRule] as never,
    );

    expect(client.mutation).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });
});
