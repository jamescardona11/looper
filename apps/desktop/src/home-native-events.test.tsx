// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  HomeKeyboardBridge,
  useHomeNativeEventBridge,
} from "./home-native-events";
import { createHomeState, reduceHomeState } from "./home-state";

const bridge = vi.hoisted(() => {
  const state = {
    cleanupCount: 0,
    handlers: {} as Record<string, unknown>,
    libraryReadyCount: 0,
    settingsReadyCount: 0,
    updateChecks: 0,
  };
  const subscribe = (name: string, handler: unknown) => {
    state.handlers[name] = handler;
    return Promise.resolve(() => {
      state.cleanupCount += 1;
    });
  };
  return { state, subscribe };
});

vi.mock("./data/library", () => ({
  notifyLibraryRendererReady: async () => {
    bridge.state.libraryReadyCount += 1;
  },
  subscribeLibraryDragDrop: (handler: unknown) =>
    bridge.subscribe("drag-drop", handler),
  subscribeLibraryDragEnter: (handler: unknown) =>
    bridge.subscribe("drag-enter", handler),
  subscribeLibraryDragLeave: (handler: unknown) =>
    bridge.subscribe("drag-leave", handler),
  subscribeLibraryDragOver: (handler: unknown) =>
    bridge.subscribe("drag-over", handler),
  subscribeLibraryOpenImport: (handler: unknown) =>
    bridge.subscribe("open-import", handler),
}));
vi.mock("./data/license", () => ({
  subscribeLicenseCheckoutReturned: (handler: unknown) =>
    bridge.subscribe("license-return", handler),
}));
vi.mock("./data/navigation", () => ({
  subscribeNavigateCalendar: (handler: unknown) =>
    bridge.subscribe("navigate-calendar", handler),
  subscribeNavigateAbout: (handler: unknown) =>
    bridge.subscribe("navigate-about", handler),
  subscribeNavigateFeatureLab: (handler: unknown) =>
    bridge.subscribe("navigate-feature-lab", handler),
  subscribeNavigateHistory: (handler: unknown) =>
    bridge.subscribe("navigate-history", handler),
  subscribeNavigateModels: (handler: unknown) =>
    bridge.subscribe("navigate-models", handler),
  subscribeNavigateSettings: (handler: unknown) =>
    bridge.subscribe("navigate-settings", handler),
}));
vi.mock("./data/overlay", () => ({
  subscribePillInserted: (handler: unknown) =>
    bridge.subscribe("pill-inserted", handler),
  subscribePillMode: (handler: unknown) =>
    bridge.subscribe("pill-mode", handler),
  subscribePillState: (handler: unknown) =>
    bridge.subscribe("pill-state", handler),
}));
vi.mock("./data/settings", () => ({
  notifySettingsRendererReady: async () => {
    bridge.state.settingsReadyCount += 1;
  },
}));
vi.mock("./data/updates", () => ({
  requestUpdaterCheck: async () => {
    bridge.state.updateChecks += 1;
  },
}));

function BridgeHarness({ licensed = true }: { licensed?: boolean }) {
  const [state, dispatch] = useReducer(
    reduceHomeState,
    licensed,
    createHomeState,
  );
  useHomeNativeEventBridge(dispatch);
  return (
    <>
      <HomeKeyboardBridge dispatch={dispatch} licensed={licensed} />
      <pre data-testid="state">{JSON.stringify(state)}</pre>
    </>
  );
}

function currentState(): ReturnType<typeof createHomeState> {
  return JSON.parse(screen.getByTestId("state").textContent ?? "{}");
}

async function finishRegistrations(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  bridge.state.cleanupCount = 0;
  bridge.state.handlers = {};
  bridge.state.libraryReadyCount = 0;
  bridge.state.settingsReadyCount = 0;
  bridge.state.updateChecks = 0;
  vi.useRealTimers();
});

describe("Home native event bridge", () => {
  test("announces readiness after retaining navigation listeners", async () => {
    const view = render(<BridgeHarness />);
    await finishRegistrations();

    expect(bridge.state.settingsReadyCount).toBe(1);
    expect(bridge.state.libraryReadyCount).toBe(1);
    expect(Object.keys(bridge.state.handlers)).toEqual(
      expect.arrayContaining([
        "navigate-settings",
        "navigate-calendar",
        "navigate-about",
        "navigate-history",
        "navigate-models",
        "drag-drop",
        "open-import",
        "license-return",
        "pill-state",
      ]),
    );

    view.unmount();
    expect(bridge.state.cleanupCount).toBe(
      Object.keys(bridge.state.handlers).length,
    );
  });

  test("opens Calendar & Meetings from the notification settings action", async () => {
    render(<BridgeHarness />);
    await finishRegistrations();

    act(bridge.state.handlers["navigate-calendar"] as () => void);

    expect(currentState()).toMatchObject({
      activeView: "settings",
      settingsTab: "app",
    });
  });

  test("deduplicates native drops and routes returned checkout events", async () => {
    render(<BridgeHarness />);
    await finishRegistrations();
    const drop = bridge.state.handlers["drag-drop"] as (
      paths: string[],
    ) => void;
    const checkoutReturned = bridge.state.handlers[
      "license-return"
    ] as () => void;

    act(() => drop(["one.m4a", "one.m4a", "two.wav"]));
    expect(currentState()).toMatchObject({
      activeView: "library",
      pendingImportPaths: ["one.m4a", "two.wav"],
    });

    act(checkoutReturned);
    expect(currentState()).toMatchObject({
      activeView: "settings",
      settingsTab: "account",
    });
  });

  test("opens About with an update check and handles the Memory shortcut", async () => {
    render(<BridgeHarness />);
    await finishRegistrations();
    const navigateAbout = bridge.state.handlers["navigate-about"] as () => void;

    act(navigateAbout);
    await finishRegistrations();
    expect(bridge.state.updateChecks).toBe(1);
    expect(currentState()).toMatchObject({
      activeView: "settings",
      settingsTab: "about",
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true }),
      );
    });
    expect(currentState().activeView).toBe("memory");
  });

  test("holds the inserted signal for eight seconds", async () => {
    vi.useFakeTimers();
    render(<BridgeHarness />);
    await finishRegistrations();
    const inserted = bridge.state.handlers["pill-inserted"] as (payload: {
      can_undo: boolean;
      chars: number;
    }) => void;

    act(() => inserted({ can_undo: true, chars: 28 }));
    expect(currentState().signalStage).toBe("inserted");
    act(() => vi.advanceTimersByTime(7_999));
    expect(currentState().signalStage).toBe("inserted");
    act(() => vi.advanceTimersByTime(1));
    expect(currentState().signalStage).toBe("ready");
  });

  test("leaves native import and Memory shortcuts untouched without access", async () => {
    render(<BridgeHarness licensed={false} />);
    await finishRegistrations();
    const dragEnter = bridge.state.handlers["drag-enter"] as (
      paths: string[],
    ) => void;
    const drop = bridge.state.handlers["drag-drop"] as (
      paths: string[],
    ) => void;
    const shortcut = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "k",
      metaKey: true,
    });

    act(() => {
      dragEnter(["private.wav"]);
      drop(["private.wav"]);
      document.dispatchEvent(shortcut);
    });

    expect(currentState()).toMatchObject({
      activeView: "home",
      dragActive: false,
      memoryPrefill: null,
      pendingImportPaths: null,
    });
    expect(shortcut.defaultPrevented).toBe(false);
  });
});
