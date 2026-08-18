import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredAudioFixtureUrl, loadSharedAudioFixture } from "./audio-fixture";

const desktopHost = vi.hoisted(() => ({
  loadAudioFixture: vi.fn(),
}));

vi.mock("@/lib/desktop-host", () => ({
  loadAudioFixture: desktopHost.loadAudioFixture,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("shared audio fixtures", () => {
  it("maps named query fixtures to the dev fixture endpoint", () => {
    window.history.replaceState(null, "", "/?audioFixture=harvard");

    expect(configuredAudioFixtureUrl()).toBe("/__e2e-audio-fixtures/harvard.wav");
  });

  it("loads a query fixture as a Blob", async () => {
    window.history.replaceState(null, "", "/?audioFixture=harvard");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["wav"], { type: "audio/wav" }),
      })),
    );

    const fixture = await loadSharedAudioFixture();

    expect(fixture).toMatchObject({
      mimeType: "audio/wav",
      name: "harvard.wav",
    });
    expect(fixture?.blob.size).toBe(3);
    expect(fetch).toHaveBeenCalledWith("/__e2e-audio-fixtures/harvard.wav");
  });

  it("falls back to the Tauri runtime fixture when no URL fixture is configured", async () => {
    desktopHost.loadAudioFixture.mockResolvedValue({
      bytes: [1, 2, 3],
      mimeType: "audio/wav",
      name: "runtime.wav",
    });

    const fixture = await loadSharedAudioFixture();

    expect(fixture).toMatchObject({ mimeType: "audio/wav", name: "runtime.wav" });
    expect(fixture?.blob.size).toBe(3);
  });

  it("treats disabled env fixture values as no URL fixture", async () => {
    vi.stubEnv("VITE_E2E_AUDIO_FIXTURE", "0");
    desktopHost.loadAudioFixture.mockResolvedValue(null);

    expect(configuredAudioFixtureUrl()).toBeNull();
    await expect(loadSharedAudioFixture()).resolves.toBeNull();
    expect(desktopHost.loadAudioFixture).toHaveBeenCalledOnce();
  });
});
