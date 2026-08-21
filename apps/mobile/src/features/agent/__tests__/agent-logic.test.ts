import { describe, expect, it } from "vitest";
import { citationsFromAnswer } from "../agent-logic";

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
});
