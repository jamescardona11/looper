import { describe, expect, test } from "vitest";
import {
  draggedPlaybackRate,
  initialLibraryPlayerState,
  libraryPlayerTimeline,
  reduceLibraryPlayer,
  steppedPlaybackRate,
  timestampSeconds,
} from "../library-player-state";

describe("library player state", () => {
  test("replaces a source without losing the chosen playback rate", () => {
    const active = {
      ...initialLibraryPlayerState(22),
      currentTime: 11,
      playing: true,
      ready: true,
      failed: true,
      rate: 2.5,
      scrubbing: true,
    };

    expect(
      reduceLibraryPlayer(active, {
        type: "source-changed",
        fallbackDuration: 8,
      }),
    ).toEqual({
      duration: 8,
      currentTime: 0,
      playing: false,
      ready: false,
      failed: false,
      rate: 2.5,
      scrubbing: false,
    });
  });

  test("distinguishes fatal sound failures from synchronous play failures", () => {
    const ready = {
      ...initialLibraryPlayerState(40),
      ready: true,
      playing: true,
    };

    expect(
      reduceLibraryPlayer(ready, {
        type: "source-failed",
        disableSource: true,
        stopPlayback: true,
      }),
    ).toMatchObject({ ready: false, playing: false, failed: true });
    expect(
      reduceLibraryPlayer(ready, {
        type: "source-failed",
        disableSource: false,
        stopPlayback: false,
      }),
    ).toMatchObject({ ready: true, playing: true, failed: true });
  });

  test("derives safe scrubber bounds and rate affordances", () => {
    expect(
      libraryPlayerTimeline({ duration: 0, currentTime: 7, rate: 0.5 }),
    ).toEqual({
      max: 1,
      value: 1,
      percent: 100,
      canDecreaseRate: false,
      canIncreaseRate: true,
    });
    expect(
      libraryPlayerTimeline({ duration: 80, currentTime: 20, rate: 4 }),
    ).toEqual({
      max: 80,
      value: 20,
      percent: 25,
      canDecreaseRate: true,
      canIncreaseRate: false,
    });
  });
});

describe("library player control policy", () => {
  test("steps and drags only through the supported playback scale", () => {
    expect(steppedPlaybackRate(1, 1)).toBe(1.5);
    expect(steppedPlaybackRate(4, 1)).toBe(4);
    expect(steppedPlaybackRate(0.5, -1)).toBe(0.5);
    expect(steppedPlaybackRate(1.25, 1)).toBe(1.5);
    expect(draggedPlaybackRate(1, 45)).toBe(2.5);
    expect(draggedPlaybackRate(1, -1_000)).toBe(0.5);
    expect(draggedPlaybackRate(1, 1_000)).toBe(4);
  });

  test("converts transcript timestamps and clamps negative starts", () => {
    expect(timestampSeconds(2_750)).toBe(2.75);
    expect(timestampSeconds(-500)).toBe(0);
  });
});
