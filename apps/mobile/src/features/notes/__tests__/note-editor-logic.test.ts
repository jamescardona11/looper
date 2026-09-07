import { describe, expect, it } from "vitest";
import { displayNoteTitle, hasUnsavedNoteChanges, persistedNoteTitle } from "../note-editor-logic";

describe("note editor autosave", () => {
  it("uses the backend's untitled title when the draft title is blank", () => {
    expect(persistedNoteTitle("   ")).toBe("Untitled note");
    expect(
      hasUnsavedNoteChanges({
        draftTitle: "",
        draftBody: "",
        savedTitle: "Untitled note",
        savedBody: "",
      }),
    ).toBe(false);
  });

  it("presents the backend placeholder in the app language", () => {
    expect(displayNoteTitle("Untitled note")).toBe("Sin título");
    expect(displayNoteTitle("  ")).toBe("Sin título");
    expect(displayNoteTitle("Plan semanal")).toBe("Plan semanal");
  });

  it("saves title and body changes", () => {
    expect(
      hasUnsavedNoteChanges({
        draftTitle: "Plan",
        draftBody: "Second draft",
        savedTitle: "Plan",
        savedBody: "First draft",
      }),
    ).toBe(true);
  });
});
