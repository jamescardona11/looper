import { beforeEach, describe, expect, test, vi } from "vitest";
import { performWindowAction } from "../window";

const nativeWindow = vi.hoisted(() => ({
  minimize: vi.fn(() => Promise.resolve()),
  toggleMaximize: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => nativeWindow,
}));

beforeEach(() => vi.clearAllMocks());

describe("performWindowAction", () => {
  test("maps public actions to the current Tauri window", async () => {
    await performWindowAction("minimize");
    await performWindowAction("maximize");
    await performWindowAction("close");

    expect(nativeWindow.minimize).toHaveBeenCalledOnce();
    expect(nativeWindow.toggleMaximize).toHaveBeenCalledOnce();
    expect(nativeWindow.close).toHaveBeenCalledOnce();
  });
});
