/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const PX_TEXT = /text-\[[0-9.]+(?:px|rem)\]/g;

// Superficies de preview (VITE_SIGNAL_PREVIEW): composiciones estáticas con
// tamaños de display fijos; no participan de la escala tipográfica de la app.
const EXEMPT_DIRS = [join("features", "preview") + sep];

// Deuda tipográfica congelada (archivo:literal). El texto legible debe usar
// los roles ui-text-* de app/App.css, que viven en la escala --ui-text-size-*
// y escalan con --ui-text-scale (zoom de texto); un literal px/rem queda fuera
// de ambas. No agregar entradas: migrar al rol más cercano y borrar la entrada.
const LEGACY = new Set([
  "features/library/components/MeetingAwarenessOverlay.tsx:text-[10px]",
  "features/library/components/MeetingCaptureOverlay.tsx:text-[10px]",
  "features/library/components/MeetingTranscriptPanel.tsx:text-[10px]",
  "features/library/components/MeetingTranscriptPanel.tsx:text-[11px]",
  "features/library/components/MeetingTranscriptPanel.tsx:text-[12px]",
  "features/library/components/MeetingTranscriptPanel.tsx:text-[13px]",
  "features/library/components/MeetingTranscriptPanel.tsx:text-[14px]",
  "features/onboarding/steps/WelcomeStep.tsx:text-[1.2rem]",
  "features/onboarding/steps/WelcomeStep.tsx:text-[3.5rem]",
  "features/personalization/components/PersonalityModal.tsx:text-[9px]",
  "features/pill/PillOverlay.tsx:text-[10px]",
  "features/pill/PillOverlay.tsx:text-[11px]",
  "features/pill/SignalRail.tsx:text-[10px]",
  "features/pill/SignalRail.tsx:text-[12px]",
  "features/settings/components/MeetingIntelligencePanel.tsx:text-[10px]",
  "features/settings/components/MeetingIntelligencePanel.tsx:text-[11px]",
]);

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true })
    .map(String)
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        !file.includes(".test.") &&
        !EXEMPT_DIRS.some((dir) => file.startsWith(dir)),
    );
}

function currentOffenders(): Set<string> {
  const offenders = new Set<string>();
  for (const file of sourceFiles()) {
    const matches = readFileSync(join(SRC, file), "utf8").match(PX_TEXT) ?? [];
    for (const literal of matches) {
      offenders.add(`${file.split(sep).join("/")}:${literal}`);
    }
  }
  return offenders;
}

describe("desktop px-text contract", () => {
  it("keeps readable text on the ui-text-* token scale", () => {
    const fresh = [...currentOffenders()].filter((key) => !LEGACY.has(key));

    expect(
      fresh,
      `Use a ui-text-* role from app/App.css instead of a raw px/rem literal ` +
        `(the token scale follows --ui-text-scale zoom):\n${fresh.join("\n")}`,
    ).toEqual([]);
  });

  it("shrinks the legacy allowlist as literals get migrated", () => {
    const offenders = currentOffenders();
    const stale = [...LEGACY].filter((key) => !offenders.has(key));

    expect(
      stale,
      `Migrated literals still allowlisted — remove these entries:\n${stale.join("\n")}`,
    ).toEqual([]);
  });
});
