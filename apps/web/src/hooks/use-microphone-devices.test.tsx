import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMicrophoneDevices } from "./use-microphone-devices";

const STORAGE_KEY = "preferred-mic-device-id";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMicrophoneDevices", () => {
  it("stays available when browser microphone APIs are missing", () => {
    vi.stubGlobal("navigator", {});

    const { result } = renderHook(() => useMicrophoneDevices());

    expect(result.current.devices).toEqual([]);
    expect(result.current.permissionState).toBe("unknown");
  });

  it("enumerates microphones, tracks permission changes, and removes listeners", async () => {
    localStorage.setItem(STORAGE_KEY, "missing-device");

    const mediaListeners = new Map<string, EventListener>();
    const permissionListeners = new Map<string, EventListener>();
    const mediaDevices = {
      enumerateDevices: vi.fn(async () => [
        {
          deviceId: "default",
          groupId: "group",
          kind: "audioinput" as const,
          label: "Built-in microphone",
          toJSON: () => ({}),
        },
      ]),
      addEventListener: vi.fn((name: string, listener: EventListener) => {
        mediaListeners.set(name, listener);
      }),
      removeEventListener: vi.fn((name: string) => {
        mediaListeners.delete(name);
      }),
    };
    const permissionStatus = {
      state: "prompt" as PermissionState,
      addEventListener: vi.fn((name: string, listener: EventListener) => {
        permissionListeners.set(name, listener);
      }),
      removeEventListener: vi.fn((name: string) => {
        permissionListeners.delete(name);
      }),
    };

    vi.stubGlobal("navigator", {
      mediaDevices,
      permissions: {
        query: vi.fn(async () => permissionStatus),
      },
    });

    const { result, unmount } = renderHook(() => useMicrophoneDevices());

    await waitFor(() => {
      expect(result.current.devices).toHaveLength(1);
      expect(result.current.selectedId).toBe("default");
      expect(result.current.permissionState).toBe("prompt");
    });

    permissionStatus.state = "granted";
    act(() => permissionListeners.get("change")?.(new Event("change")));
    expect(result.current.permissionState).toBe("granted");

    unmount();
    expect(mediaListeners.has("devicechange")).toBe(false);
    expect(permissionListeners.has("change")).toBe(false);
  });
});
