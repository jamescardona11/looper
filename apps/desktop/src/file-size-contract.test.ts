/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const TAURI_SRC = resolve(SRC, "..", "src-tauri", "src");

// Un archivo nuevo no debería superar esto: obliga a descomponer módulos y
// componentes antes de que se vuelvan inmanejables.
const MAX_LINES = 1000;

// Deuda de tamaño congelada: archivos legados con presupuesto ampliado.
// Pueden reducirse (y salir de la lista), no seguir creciendo sin tope.
const LEGACY_BUDGET = 3000;
const LEGACY = new Set([
  "src-tauri/src/assistive.rs",
  "src-tauri/src/library/meeting_capture.rs",
  "src-tauri/src/license.rs",
  "src-tauri/src/llm_cleanup.rs",
  "src-tauri/src/pill.rs",
  "src-tauri/src/recorder.rs",
  "src-tauri/src/remote_api.rs",
  "src-tauri/src/transcribe.rs",
]);

type Rule = { root: string; prefix: string; extensions: RegExp };

const RULES: Rule[] = [
  { root: SRC, prefix: "src", extensions: /\.(ts|tsx)$/ },
  { root: TAURI_SRC, prefix: "src-tauri/src", extensions: /\.rs$/ },
];

function offendersFor(rule: Rule): string[] {
  return readdirSync(rule.root, { recursive: true })
    .map(String)
    .filter((file) => rule.extensions.test(file))
    .flatMap((file) => {
      const relPath = `${rule.prefix}/${file.split(sep).join("/")}`;
      const lines = readFileSync(join(rule.root, file), "utf8").split(
        "\n",
      ).length;
      const budget = LEGACY.has(relPath) ? LEGACY_BUDGET : MAX_LINES;
      return lines > budget
        ? [`${relPath}: ${lines} lines (max ${budget})`]
        : [];
    });
}

describe("desktop file-size contract", () => {
  it("keeps source files under the line budget", () => {
    const offenders = RULES.flatMap(offendersFor);

    expect(
      offenders,
      `Split these files into smaller modules:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("shrinks the legacy allowlist as files get split", () => {
    const stale: string[] = [];
    for (const relPath of LEGACY) {
      const [root, prefix] = relPath.startsWith("src-tauri/")
        ? [TAURI_SRC, "src-tauri/src/"]
        : [SRC, "src/"];
      const filePath = join(root, relPath.slice(prefix.length));
      try {
        const lines = readFileSync(filePath, "utf8").split("\n").length;
        if (lines <= MAX_LINES) stale.push(`${relPath}: now ${lines} lines`);
      } catch {
        stale.push(`${relPath}: file no longer exists`);
      }
    }

    expect(
      stale,
      `These files now fit the regular budget — remove them from LEGACY:\n${stale.join("\n")}`,
    ).toEqual([]);
  });
});
