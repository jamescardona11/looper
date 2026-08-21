import { describe, expect, test } from "vitest";
import { typography } from "../typography";

/**
 * La escala se escribe a mano desde la tabla del contrato, así que lo que puede
 * romperse en silencio es la unidad: un tracking copiado en em desde el diseño
 * compila igual, se ve casi bien y deja los títulos sin apretar.
 */
describe("typography", () => {
  const roles = Object.entries(typography);

  test("display lleva el tracking en puntos, no en em", () => {
    // -0.03em × 29 = -0.87. Si alguien copia el -0.03 del diseño, cae aquí.
    expect(typography.display.letterSpacing).toBeLessThan(-0.5);
    expect(typography.display.letterSpacing).toBeGreaterThan(-1);
  });

  test("ningún rol conserva un tracking en em", () => {
    // Los valores en em del contrato están todos por debajo de 0.1; los mismos
    // convertidos a puntos, todos por encima.
    for (const [role, style] of roles) {
      if (style.letterSpacing === 0) continue;
      expect(Math.abs(style.letterSpacing), `${role} parece estar en em`).toBeGreaterThanOrEqual(
        0.1,
      );
    }
  });

  test("cada rol deja aire entre líneas", () => {
    for (const [role, style] of roles) {
      expect(style.lineHeight, `${role}`).toBeGreaterThan(style.fontSize);
    }
  });
});
