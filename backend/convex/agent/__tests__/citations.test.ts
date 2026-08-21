import { describe, expect, it } from "vitest";
import { appendMemoryCitations, memoryCitationsFromToolResults } from "../citations";

describe("memory citations", () => {
  it("extracts unique citations only from Looper memory tool results", () => {
    expect(
      memoryCitationsFromToolResults([
        {
          toolName: "searchLooperMemory",
          output: [
            { kind: "note", title: "Launch plan", text: "..." },
            { kind: "note", title: "Launch plan", text: "..." },
            { kind: "meeting", title: "Weekly sync", text: "..." },
            { kind: "unknown", title: "Ignore me" },
          ],
        },
        { toolName: "otherTool", output: [{ kind: "note", title: "Ignore me" }] },
      ]),
    ).toEqual([
      { kind: "note", title: "Launch plan" },
      { kind: "meeting", title: "Weekly sync" },
    ]);
  });

  it("appends missing citations without duplicating markers already in the answer", () => {
    expect(
      appendMemoryCitations("Resumen [Note: Launch plan]", [
        { kind: "note", title: "Launch plan" },
        { kind: "meeting", title: "Weekly sync" },
      ]),
    ).toBe("Resumen [Note: Launch plan]\n\nFuentes: [Meeting: Weekly sync]");
  });
});
