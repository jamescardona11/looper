import { describe, expect, it } from "vitest";
import { answerParts, citationsFromAnswer } from "../agent-logic";

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
      { kind: "text", value: "La decisión fue dejarlo opcional " },
      { kind: "citation", citation: { kind: "Meeting", title: "Product sync 08:42" } },
      { kind: "text", value: "." },
    ]);
  });
});
