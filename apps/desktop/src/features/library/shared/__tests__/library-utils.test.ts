import { beforeAll, describe, expect, test } from "vitest";

import { activateLocale } from "../../../../i18n";
import {
  PLAYBACK_RATES,
  SUPPORTED_EXTENSIONS,
  clampProgress,
  formatBytes,
  formatDeleteErrorMessage,
  formatDuration,
  formatImportErrorMessage,
  formatLibraryName,
  formatPlaybackRate,
  getFileExtension,
  getLibraryErrorDetails,
  sanitizeFileName,
  shouldShowImportProgress,
  uniquePaths,
} from "../library-utils";

beforeAll(() => activateLocale("en"));

describe("library media helpers", () => {
  test("keeps the supported media and playback options stable", () => {
    expect(SUPPORTED_EXTENSIONS).toEqual([
      "wav",
      "mp3",
      "m4a",
      "aac",
      "ogg",
      "flac",
      "mp4",
      "mov",
      "webm",
      "mkv",
    ]);
    expect(PLAYBACK_RATES).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 4]);
  });

  test("normalizes progress and limits the visible progress window", () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(1.4)).toBe(1);
    expect(shouldShowImportProgress(0.019)).toBe(false);
    expect(shouldShowImportProgress(0.02)).toBe(true);
    expect(shouldShowImportProgress(0.979)).toBe(true);
    expect(shouldShowImportProgress(0.98)).toBe(false);
  });

  test("formats time, size, and playback labels", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(65.6)).toBe("1:06");
    expect(formatDuration(3_661)).toBe("1:01:01");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
    expect(formatPlaybackRate(1)).toBe("1");
    expect(formatPlaybackRate(2.5)).toBe("2.5");
  });

  test("normalizes library names and file paths", () => {
    expect(getFileExtension("Meeting.MP4")).toBe("mp4");
    expect(getFileExtension("README")).toBe("");
    expect(uniquePaths(["a.wav", "b.mp3", "a.wav"])).toEqual([
      "a.wav",
      "b.mp3",
    ]);
    expect(formatLibraryName("daily_meeting.notes")).toBe(
      "daily meeting notes",
    );
    expect(sanitizeFileName("  report: week / 1?.md  ")).toBe(
      "report- week - 1-.md",
    );
  });
});

describe("library error messages", () => {
  test("maps import failures to actionable messages", () => {
    expect(formatImportErrorMessage("selected model is not installed")).toBe(
      "Selected model isn't installed. Download one in Settings -> Models.",
    );
    expect(
      formatImportErrorMessage("audio decode failed: corrupt packet"),
    ).toBe("Couldn't decode this audio file. Try installing FFmpeg.");
    expect(formatImportErrorMessage("unclassified failure")).toBe(
      "Import failed for one of the files.",
    );
  });

  test("maps deletion failures without exposing backend details", () => {
    expect(formatDeleteErrorMessage("outside the library folder")).toBe(
      "Couldn't delete this item because its files are outside the library folder.",
    );
    expect(formatDeleteErrorMessage("unexpected backend failure")).toBe(
      "Failed to delete the library item.",
    );
  });

  test("marks errors that should offer FFmpeg help", () => {
    expect(getLibraryErrorDetails("unsupported audio codec")).toEqual({
      message: "Not a valid audio file.",
      showFfmpegHelp: true,
    });
    expect(getLibraryErrorDetails("ffmpeg executable not found")).toEqual({
      message: "FFmpeg required for video imports.",
      showFfmpegHelp: true,
    });
    expect(getLibraryErrorDetails("service temporarily unavailable")).toEqual({
      message: "service temporarily unavailable",
      showFfmpegHelp: false,
    });
  });
});
