import { describe, expect, test } from "vitest";
import { ICON_PATHS } from "../icon-paths";

/**
 * Un `d` vacío o mal formado no lanza: el icono se pinta en blanco y nadie se
 * entera hasta que alguien mira la pantalla. Estas comprobaciones son el único
 * aviso automático.
 */
describe("icon paths", () => {
  // A propósito sin tipar como `IconName`: si el mapa pierde un icono esto
  // tiene que fallar como test, no desaparecer con el tipo.
  const INVENTORY: readonly string[] = [
    "library",
    "ask",
    "studio",
    "meeting",
    "dictado",
    "nota",
    "search",
    "import",
    "plus",
    "close",
    "check",
    "chevronRight",
    "chevronLeft",
    "chevronDown",
    "bookmark",
    "mic",
    "stop",
    "arrowUp",
    "globe",
    "keyboard",
    "lock",
    "refresh",
    "more",
    "edit",
    "warning",
  ];

  test("covers the inventory the redesign depends on", () => {
    for (const name of INVENTORY) {
      expect(ICON_PATHS, name).toHaveProperty(name);
    }
  });

  test("every icon draws at least one subpath", () => {
    for (const [name, subpaths] of Object.entries(ICON_PATHS)) {
      expect(subpaths.length, name).toBeGreaterThan(0);
    }
  });

  test("every subpath starts with a moveto command", () => {
    for (const [name, subpaths] of Object.entries(ICON_PATHS)) {
      for (const d of subpaths) {
        expect(typeof d, name).toBe("string");
        expect(d.trim(), name).not.toBe("");
        expect(d.trim().startsWith("M") || d.trim().startsWith("m"), `${name}: ${d}`).toBe(true);
      }
    }
  });
});
