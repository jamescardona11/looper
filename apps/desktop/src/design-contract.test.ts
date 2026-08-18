/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const STYLE_FILES = [
  "app/App.css",
  "app/animations.css",
  "app/styles/foundation.css",
  "app/styles/utilities.css",
  "app/styles/surfaces.css",
];
const CSS = STYLE_FILES.map((file) =>
  readFileSync(join(SRC, file), "utf8"),
).join("\n");
const RAW_COLOR = /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi;
const INLINE_FONT_FAMILY = /fontFamily\s*:\s*["'][^"']+["']/g;

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true })
    .map(String)
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) && !file.endsWith("design-contract.test.ts"),
    )
    .map((file) => join(SRC, file));
}

describe("desktop design contract", () => {
  it("keeps every Pill state free of exterior shadows", () => {
    expect(CSS).toMatch(/--ui-pill-shell-shadow:\s*none;/);
  });

  it("keeps the idle Dictation dock free of exterior shadows", () => {
    const captureShellRule = CSS.match(
      /\.ui-sticky-launcher,\s*\.ui-capture-dock\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(captureShellRule).toContain("box-shadow: none;");
  });

  it("keeps overlay notifications free of exterior shadows", () => {
    expect(CSS).toMatch(/--ui-notification-shadow:\s*none;/);
  });

  it("keeps meeting and toast notifications at the same visible width", () => {
    const awareness = readFileSync(
      join(SRC, "features/library/components/MeetingAwarenessOverlay.tsx"),
      "utf8",
    );
    const toast = readFileSync(
      join(SRC, "features/toast/ToastOverlay.tsx"),
      "utf8",
    );

    expect(awareness).toContain("w-[404px]");
    expect(toast).toContain("w-[404px] max-w-[404px]");
  });

  it("keeps color literals in the style bundle instead of feature code", () => {
    const offenders = sourceFiles().flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(RAW_COLOR);
      return matches
        ? [`${file.replace(SRC, "src")}: ${[...new Set(matches)].join(", ")}`]
        : [];
    });

    expect(
      offenders,
      `Promote colors to semantic variables in the app style bundle:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps inline font families connected to typography tokens", () => {
    const offenders = sourceFiles().flatMap((file) => {
      const matches =
        readFileSync(file, "utf8").match(INLINE_FONT_FAMILY) ?? [];
      const rawFamilies = matches.filter(
        (match) => !match.includes("var(--font-"),
      );
      return rawFamilies.length > 0
        ? [
            `${file.replace(SRC, "src")}: ${[...new Set(rawFamilies)].join(", ")}`,
          ]
        : [];
    });

    expect(
      offenders,
      `Use --font-ui or --font-display from the app style bundle:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
