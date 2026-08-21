// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type SoundOptions = {
  src: string[];
  html5: boolean;
  preload: boolean;
  onload?: () => void;
  onloaderror?: (id: number | string, error: unknown) => void;
  onplayerror?: (id: number | string, error: unknown) => void;
  onplay?: () => void;
  onpause?: () => void;
  onstop?: () => void;
  onend?: () => void;
  onseek?: () => void;
};

type SoundEvent =
  | "load"
  | "loaderror"
  | "playerror"
  | "play"
  | "pause"
  | "stop"
  | "end"
  | "seek";

const audioHarness = vi.hoisted(() => ({
  sounds: [] as unknown[],
}));

type MockSound = {
  options: SoundOptions;
  unload: () => void;
  rate: (value: number) => number;
  _sounds: Array<{ _node: { paused: boolean; ended: boolean } }>;
  durationValue: number;
  position: number;
  playingValue: boolean;
  duration: () => number;
  playing: () => boolean;
  play: () => number;
  pause: () => void;
  seek: (value?: number) => unknown;
  emit: (event: SoundEvent, error?: unknown) => void;
};

vi.mock("howler", () => {
  class SoundDouble {
    readonly unload = vi.fn();
    readonly rate = vi.fn((value: number) => value);
    readonly _sounds = [{ _node: { paused: true, ended: false } }];
    durationValue = 0;
    position = 0;
    playingValue = false;

    constructor(readonly options: SoundOptions) {
      audioHarness.sounds.push(this);
    }

    duration(): number {
      return this.durationValue;
    }

    playing(): boolean {
      return this.playingValue;
    }

    play = vi.fn(() => {
      this.playingValue = true;
      this._sounds[0]._node.paused = false;
      this.options.onplay?.();
      return 1;
    });

    pause = vi.fn(() => {
      this.playingValue = false;
      this._sounds[0]._node.paused = true;
      this.options.onpause?.();
    });

    seek = vi.fn((value?: number) => {
      if (typeof value === "number") {
        this.position = value;
        this.options.onseek?.();
        return this;
      }
      return this.position;
    });

    emit(event: SoundEvent, error?: unknown): void {
      if (event === "loaderror") {
        this.options.onloaderror?.(1, error);
      } else if (event === "playerror") {
        this.options.onplayerror?.(1, error);
      } else {
        this.options[`on${event}`]?.();
      }
    }
  }

  return { Howl: SoundDouble };
});
vi.mock("../../../../data/library", () => ({
  resolveLibraryAudioUrl: (path: string) => `asset://${path}`,
}));

import { useLibraryPlayer } from "../useLibraryPlayer";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

beforeEach(() => {
  audioHarness.sounds.length = 0;
  frameCallbacks.clear();
  nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frameCallbacks.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function latestSound(): MockSound {
  const sound = audioHarness.sounds.at(-1) as MockSound | undefined;
  if (!sound) throw new Error("Expected the player to create a sound");
  return sound;
}

function runNextFrame(timestamp = 16): void {
  const next = frameCallbacks.entries().next().value as
    [number, FrameRequestCallback] | undefined;
  if (!next) return;
  frameCallbacks.delete(next[0]);
  next[1](timestamp);
}

describe("library player lifecycle", () => {
  test("loads the selected source, resets on replacement, and unloads resources", () => {
    const { result, rerender, unmount } = renderHook(
      ({ path, duration }) =>
        useLibraryPlayer({ audioPath: path, durationSeconds: duration }),
      {
        wrapper,
        initialProps: { path: "first.wav", duration: 9 },
      },
    );
    const first = latestSound();

    expect(first.options).toMatchObject({
      src: ["asset://first.wav"],
      html5: true,
      preload: true,
    });
    expect(first.rate).toHaveBeenLastCalledWith(1);
    expect(result.current.audioDuration).toBe(9);
    expect(result.current.audioReady).toBe(false);

    act(() => {
      first.durationValue = 42;
      first.emit("load");
    });
    expect(result.current.audioDuration).toBe(42);
    expect(result.current.audioReady).toBe(true);

    rerender({ path: "second.wav", duration: 5 });
    const second = latestSound();
    expect(first.unload).toHaveBeenCalled();
    expect(second.options.src).toEqual(["asset://second.wav"]);
    expect(result.current).toMatchObject({
      audioDuration: 5,
      audioCurrentTime: 0,
      audioReady: false,
      audioError: null,
      isPlaying: false,
    });

    unmount();
    expect(second.unload).toHaveBeenCalledOnce();
  });

  test("tracks playback, seeking, completion, and progress from sound events", () => {
    const { result } = renderHook(
      () => useLibraryPlayer({ audioPath: "talk.wav", durationSeconds: 120 }),
      { wrapper },
    );
    const sound = latestSound();

    act(() => {
      sound.durationValue = 120;
      sound.emit("load");
      sound.play();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      sound.position = 30;
      runNextFrame();
    });
    expect(result.current.audioCurrentTime).toBe(30);
    expect(result.current.scrubberValue).toBe(30);
    expect(result.current.scrubberPercent).toBe(25);

    act(() => {
      sound.position = 45;
      sound.emit("seek");
    });
    expect(result.current.audioCurrentTime).toBe(45);

    act(() => sound.emit("end"));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.audioCurrentTime).toBe(120);
    expect(frameCallbacks.size).toBe(0);
  });
});

describe("library player controls", () => {
  test("changes rate, pauses while scrubbing, resumes, and opens timestamps", () => {
    const { result } = renderHook(
      () =>
        useLibraryPlayer({ audioPath: "controls.wav", durationSeconds: 80 }),
      { wrapper },
    );
    const sound = latestSound();
    act(() => {
      sound.durationValue = 80;
      sound.emit("load");
      sound.play();
      result.current.handlePlaybackRateStep(1);
    });
    expect(result.current.playbackRate).toBe(1.5);
    expect(sound.rate).toHaveBeenLastCalledWith(1.5);

    act(() => result.current.handleScrubStart());
    expect(sound.pause).toHaveBeenCalledOnce();

    act(() => result.current.handleScrubChange("18.5"));
    expect(result.current.audioCurrentTime).toBe(18.5);
    expect(sound.seek).toHaveBeenLastCalledWith(18.5);

    act(() => result.current.handleScrubEnd());
    expect(sound.play).toHaveBeenCalledTimes(2);

    act(() => result.current.handleTimestampClick(-2_000));
    expect(sound.seek).toHaveBeenCalledWith(0);
  });

  test("locks controls and surfaces load and play failures", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { result } = renderHook(
      () => useLibraryPlayer({ audioPath: "broken.wav", durationSeconds: 12 }),
      { wrapper },
    );
    const sound = latestSound();

    act(() => result.current.handleTogglePlayback());
    expect(sound.play).not.toHaveBeenCalled();

    act(() => sound.emit("loaderror", new Error("decode")));
    expect(result.current.audioError).toBe("Audio unavailable");
    expect(result.current.audioReady).toBe(false);

    act(() => sound.emit("playerror", new Error("device")));
    expect(result.current.isPlaying).toBe(false);
    expect(frameCallbacks.size).toBe(0);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  test("maps horizontal rate dragging to the bounded playback scale", () => {
    const { result } = renderHook(
      () => useLibraryPlayer({ audioPath: "rate.wav", durationSeconds: 10 }),
      { wrapper },
    );
    const sound = latestSound();
    act(() => {
      sound.emit("load");
      result.current.handleRateScrubStart({
        clientX: 100,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLSpanElement>);
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 145 }));
    });

    expect(result.current.playbackRate).toBe(2.5);
    expect(sound.rate).toHaveBeenLastCalledWith(2.5);

    act(() => window.dispatchEvent(new MouseEvent("mouseup")));
    act(() =>
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 })),
    );
    expect(result.current.playbackRate).toBe(2.5);
  });
});
