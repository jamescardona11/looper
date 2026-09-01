import { describe, expect, it } from "vitest";
import { answerParts, citationsFromAnswer, inlineEmphasisParts } from "../agent-logic";

describe("citationsFromAnswer", () => {
  it("extracts and deduplicates Looper memory references", () => {
    expect(
      citationsFromAnswer(
        "La fecha fue aprobada [Meeting: Weekly sync]. La nota lo confirma [Note: Launch plan] [Meeting: Weekly sync].",
      ),
    ).toEqual([
      { kind: "Meeting", title: "Weekly sync" },
      { kind: "Note", title: "Launch plan" },
    ]);
  });

  it("ignores unrelated markdown brackets", () => {
    expect(citationsFromAnswer("Usa [este enlace](https://example.com).")).toEqual([]);
  });

  it("keeps citations next to the sentence they support", () => {
    expect(answerParts("La decisión fue dejarlo opcional [Meeting: Product sync 08:42].")).toEqual([
      { kind: "text", start: 0, value: "La decisión fue dejarlo opcional " },
      {
        kind: "citation",
        start: 33,
        citation: { kind: "Meeting", title: "Product sync 08:42" },
      },
      { kind: "text", start: 62, value: "." },
    ]);
  });

  it("separates inline emphasis without exposing markdown markers", () => {
    expect(inlineEmphasisParts('La nota **"Auditoria movil"** confirma el acuerdo.')).toEqual([
      { emphasized: false, start: 0, value: "La nota " },
      { emphasized: true, start: 8, value: '"Auditoria movil"' },
      { emphasized: false, start: 29, value: " confirma el acuerdo." },
    ]);
  });

  it("keeps unmatched emphasis markers as normal text", () => {
    expect(inlineEmphasisParts("El texto termina con **una marca")).toEqual([
      { emphasized: false, start: 0, value: "El texto termina con **una marca" },
    ]);
  });
});
