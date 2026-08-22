import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Brand-consistency drift guard (web).
//
// Looper is single-accent (periwinkle) on mineral neutrals, driven entirely by
// semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-success-subtle`,
// …) from the app token CSS. The lint `j11/no-color-literal` blocks hex/rgb
// literals — but NOT Tailwind's built-in palette utilities (`bg-emerald-500`,
// `text-indigo-400`). That gap is exactly how an off-brand green badge once
// shipped. This guard closes it: no raw Tailwind palette utility may appear in
// app source. If you need a new color, add it to the token CSS and use the
// semantic token.
//
// If this fails: replace the flagged `bg-<palette>-<shade>` with a semantic
// token from `src/app/tokens.css`.

const SRC = dirname(fileURLToPath(import.meta.url));

const TW_PALETTES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const TW_PROPS =
  "bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|placeholder|caret|accent|shadow";
const PALETTE_RE = new RegExp(
  `\\b(?:${TW_PROPS})-(?:${TW_PALETTES})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
  "g",
);

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .map((f) => join(SRC, f));
}

describe("theme consistency (web): only semantic tokens, no raw Tailwind palette colors", () => {
  it("uses no off-brand Tailwind palette utilities", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const matches = readFileSync(file, "utf8").match(PALETTE_RE);
      if (matches)
        offenders.push(`${file.replace(SRC, "src")}: ${[...new Set(matches)].join(", ")}`);
    }
    expect(
      offenders,
      `Use semantic tokens (bg-primary, text-success-foreground, …) instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("is not vacuous — the matcher catches a known off-brand class", () => {
    expect('className="bg-emerald-500/15 text-indigo-400"'.match(PALETTE_RE)).not.toBeNull();
    expect("bg-primary text-muted-foreground".match(PALETTE_RE)).toBeNull(); // semantic = fine
  });
});
