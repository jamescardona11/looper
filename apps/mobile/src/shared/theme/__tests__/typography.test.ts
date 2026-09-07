import { describe, expect, test } from "vitest";
import { typography } from "../typography";

/**
 * La escala se escribe a mano desde la tabla del contrato, así que lo que puede
 * romperse en silencio es la unidad: un tracking copiado en em desde el diseño
 * compila igual, se ve casi bien y deja los títulos sin apretar.
 */
describe("typography", () => {
  const roles = Object.entries(typography);

  test("the mobile scale avoids tightened display tracking", () => {
    expect(typography.display.letterSpacing).toBe(0);
  });

  test("ningún rol conserva un tracking fraccional", () => {
    for (const [role, style] of roles) {
      if (style.letterSpacing === 0) continue;
      expect(
        Math.abs(style.letterSpacing),
        `${role} parece tener tracking fraccional`,
      ).toBeGreaterThanOrEqual(0.1);
    }
  });

  test("cada rol deja aire entre líneas", () => {
    for (const [role, style] of roles) {
      expect(style.lineHeight, `${role}`).toBeGreaterThan(style.fontSize);
    }
  });
});
