import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";

// El atajo de dictado se configura, así que dibujarlo a mano deja la interfaz
// anunciando una combinación que el usuario pudo haber cambiado -- y ningún
// grep de "Opt+Space" lo encuentra, porque esa cadena nunca llega a existir.
// Se vigila solo dentro de <kbd>, que es como se pintan esas teclas; un ⌘↵ de
// ayuda en un <span> es una interacción fija de la pantalla, no un ajuste.
// Las superficies de preview quedan fuera: son prototipos con teclas fijas.
const MODIFIER_GLYPHS = ["⌥", "⌘", "⌃", "⇧"];
const KBD_BLOCK = /<kbd\b[^>]*>([\s\S]*?)<\/kbd>/g;

const files = (readdirSync("src/features", { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".tsx") &&
      !file.includes("preview") &&
      !file.includes(".test."),
  )
  .map((file) => `src/features/${file}`);

function hardcodedKeysIn(source: string): string[] {
  return [...source.matchAll(KBD_BLOCK)]
    .map((match) => match[1])
    .filter((body) => MODIFIER_GLYPHS.some((glyph) => body.includes(glyph)));
}

describe("the dictation shortcut is never hardcoded", () => {
  test("no screen paints a modifier key inside <kbd>", () => {
    const offenders = files.filter(
      (file) => hardcodedKeysIn(readFileSync(file, "utf8")).length > 0,
    );

    expect(offenders).toEqual([]);
  });

  test("the guard catches a hardcoded key when there is one", () => {
    expect(hardcodedKeysIn('<kbd className="x">⌥</kbd>')).toHaveLength(1);
    expect(hardcodedKeysIn("<span>⌘↵</span>")).toHaveLength(0);
  });
});
