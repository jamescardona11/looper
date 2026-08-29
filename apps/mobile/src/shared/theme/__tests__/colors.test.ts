import { describe, expect, test } from "vitest";
import { colors } from "../colors";

/**
 * `colors.ts` lo genera tools/tokens/generate.mjs desde la paleta compartida, y
 * ese paquete ya comprueba que el fichero coincide con la fuente. Aquí sólo se
 * verifican las invariantes propias del móvil, sin duplicar la paleta ni añadir
 * una dependencia que Metro tendría que resolver.
 */
describe("mobile theme", () => {
  const REQUIRED = [
    "background",
    "backgroundSecondary",
    "surfaceMuted",
    "surface",
    "surfaceElevated",
    "border",
    "borderStrong",
    "text",
    "textSecondary",
    "muted",
    "disabled",
    "accent",
    "accentLight",
    "accentDark",
    "accentSubtle",
    "overlay",
    "pillShell",
    "pillBorder",
    "pillDotBase",
    "pillDotHighlight",
    "brandPaper",
    "danger",
    "onDanger",
    "onAccent",
  ] as const;

  test("exposes every role the shell consumes", () => {
    for (const role of REQUIRED) {
      expect(colors, `missing ${role}`).toHaveProperty(role);
    }
  });

  test("every value is a usable color", () => {
    for (const [role, value] of Object.entries(colors)) {
      expect(value, `${role} = ${value}`).toMatch(/^(#[0-9a-f]{6}|rgba?\([\d\s.,]+\))$/i);
    }
  });

  test("the pill and primary action retain contrast over the light canvas", () => {
    expect(colors.pillShell).not.toBe(colors.background);
    expect(colors.pillBorder).not.toBe(colors.border);
    expect(colors.onAccent).toBe("#ffffff");
  });

  test("text roles descend in weight without repeating a value", () => {
    const ladder = [colors.text, colors.textSecondary, colors.muted, colors.disabled];
    expect(new Set(ladder).size).toBe(ladder.length);
  });
});
