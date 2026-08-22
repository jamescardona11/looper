// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const sourceFiles = walk(sourceRoot).filter((file) => [".ts", ".tsx"].includes(extname(file)));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repositoryFiles = ["apps", "backend", "packages", "tools"].flatMap((directory) =>
  walk(join(repositoryRoot, directory)),
);

describe("Web architecture", () => {
  it("keeps unit tests in local __tests__ folders", () => {
    const misplaced = repositoryFiles.filter(
      (file) =>
        /\.(test|spec)\.(?:[cm]?[jt]sx?)$/.test(file) &&
        !["/__tests__/", "/tests/", "/e2e/"].some((directory) => file.includes(directory)),
    );

    expect(misplaced).toEqual([]);
  });

  it("does not implement native or browser audio capture", () => {
    const forbidden = [
      "@tauri-apps/",
      "MediaRecorder",
      "getUserMedia",
      "AudioContext",
      "useAudioRecorder",
      "useMicrophoneDevices",
      "useStreamingStt",
      "useTranscribe",
    ];
    const violations = findTokens(sourceFiles, forbidden);

    expect(violations).toEqual([]);
  });

  it("does not import another application or Desktop write interfaces", () => {
    const forbidden = [
      "apps/desktop",
      "apps/mobile",
      "@looper/desktop",
      "@looper/mobile",
      "useRecordDictation",
      "useNoteCommands",
      "useMeetingCommands",
    ];
    const violations = findTokens(sourceFiles, forbidden);

    expect(violations).toEqual([]);
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", "target", ".turbo", ".expo"].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function findTokens(files: string[], tokens: string[]): string[] {
  return files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return tokens.filter((token) => source.includes(token)).map((token) => `${file}: ${token}`);
  });
}
