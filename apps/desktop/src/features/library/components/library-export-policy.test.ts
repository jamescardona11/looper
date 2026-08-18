import { describe, expect, test } from "vitest";

import {
  buildLibraryExportDialog,
  classifyLibraryExportFailure,
  completeLibraryExportPath,
  readLibraryExportError,
} from "./library-export-policy";

describe("library export policy", () => {
  test("builds a safe default file name and a format-specific filter", () => {
    expect(
      buildLibraryExportDialog('  Weekly: sync / notes?  ', "md", "Export"),
    ).toEqual({
      title: "Export",
      defaultPath: "Weekly- sync - notes-.md",
      filters: [{ name: "MD", extensions: ["md"] }],
    });
    expect(buildLibraryExportDialog("   ", "txt", "Export").defaultPath).toBe(
      "transcript.txt",
    );
  });

  test("appends only a missing format extension", () => {
    expect(completeLibraryExportPath("/tmp/notes", "srt")).toBe(
      "/tmp/notes.srt",
    );
    expect(completeLibraryExportPath("/tmp/notes.SRT", "srt")).toBe(
      "/tmp/notes.SRT",
    );
  });

  test.each([
    ["No timestamp segments available", "timestamps"],
    ["Failed to write export file", "write"],
    ["Library item not found", "missing-item"],
    ["network unavailable", "other"],
  ] as const)("classifies %s as %s", (message, expected) => {
    expect(classifyLibraryExportFailure(message)).toBe(expected);
  });

  test("normalizes thrown values without dropping an empty error message", () => {
    expect(readLibraryExportError(new Error("disk full"))).toBe("disk full");
    expect(readLibraryExportError("plain failure")).toBe("plain failure");
    expect(readLibraryExportError(new Error(""))).toBe("");
  });
});
