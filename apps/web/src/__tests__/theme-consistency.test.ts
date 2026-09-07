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

  it("keeps the frame, workspace, and paper as distinct light surfaces", () => {
    const tokens = readFileSync(join(SRC, "../app/tokens.css"), "utf8");

    expect(tokens).toContain("--background: var(--web-workspace);");
    expect(tokens).toMatch(/\.web-product-canvas\s*\{[^}]*background:\s*var\(--web-canvas\)/s);
    expect(tokens).toMatch(
      /\.web-product-workspace\s*\{[^}]*background:\s*var\(--web-workspace\)/s,
    );
    expect(tokens).toContain("--web-canvas: #ecebe7;");
    expect(tokens).toContain("--web-workspace: #f7f6f2;");
    expect(tokens).toContain("--web-paper: #fffefa;");
  });

  it("does not use near-black blocks for selected navigation chrome", () => {
    const shell = readFileSync(join(SRC, "../app/authenticated-shell.tsx"), "utf8");
    const loading = readFileSync(join(SRC, "../shared/components/route-loading-state.tsx"), "utf8");

    expect(shell).not.toContain('"bg-foreground text-card hover:bg-foreground hover:text-card"');
    expect(loading).not.toContain("bg-[var(--web-ink)]");
  });

  it("reserves the measured cookie banner inset in full-height product layouts", () => {
    const tokens = readFileSync(join(SRC, "../app/tokens.css"), "utf8");

    expect(tokens).toMatch(
      /body\s*\{[^}]*padding-bottom:\s*var\(--cookie-consent-height,\s*0px\)/s,
    );
    expect(tokens).toMatch(
      /\.web-product-canvas\s*\{[^}]*min-height:\s*calc\(100vh\s*-\s*var\(--cookie-consent-height,\s*0px\)\)/s,
    );
    expect(tokens).toMatch(
      /\.web-product-shell\s*\{[^}]*height:\s*calc\(100vh\s*-\s*16px\s*-\s*var\(--cookie-consent-height,\s*0px\)\)/s,
    );
  });
});
