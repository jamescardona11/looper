import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acquireMicStream, requestMicPermission } from "./mic";

function fakeStream() {
  const track1 = { stop: vi.fn() };
  const track2 = { stop: vi.fn() };
  return { getTracks: () => [track1, track2], track1, track2 };
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMedia = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acquireMicStream", () => {
  it("requests audio with the caller's constraints", async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const result = await acquireMicStream({ echoCancellation: true });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true } });
    expect(result).toBe(stream);
  });

  it("defaults to audio: true", async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    await acquireMicStream();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });
});

describe("requestMicPermission", () => {
  it("stops every track and returns true when granted (no leak)", async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const granted = await requestMicPermission();
    expect(granted).toBe(true);
    expect(stream.track1.stop).toHaveBeenCalledTimes(1);
    expect(stream.track2.stop).toHaveBeenCalledTimes(1);
  });

  it("returns false when denied", async () => {
    getUserMedia.mockRejectedValue(new Error("NotAllowedError"));
    expect(await requestMicPermission()).toBe(false);
  });
});
