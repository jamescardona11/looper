import { describe, expect, test } from "vitest";
import type { LibraryItem } from "../../../../contracts";
import {
  cardActionKind,
  cardStatus,
  cardStatusClass,
  formatCardCreatedAt,
  libraryCardStatusText,
} from "../library-card-model";

const itemWithStatus = (status: LibraryItem["status"]): LibraryItem =>
  ({ status }) as LibraryItem;

describe("library card model", () => {
  test("clamps transcription progress and hides it for terminal states", () => {
    expect(
      cardStatus(itemWithStatus({ type: "transcribing", progress: 1.4 })),
    ).toEqual({ progress: 1, transcribing: true });
    expect(cardStatus(itemWithStatus({ type: "complete" }))).toEqual({
      progress: 0,
      transcribing: false,
    });
  });

  test("maps each processing phase to the existing menu action", () => {
    expect(cardActionKind("recording")).toBe("none");
    expect(cardActionKind("pending")).toBe("cancel");
    expect(cardActionKind("importing")).toBe("cancel");
    expect(cardActionKind("transcribing")).toBe("cancel");
    expect(cardActionKind("cancelling")).toBe("cancel");
    expect(cardActionKind("complete")).toBe("retry");
    expect(cardActionKind("error")).toBe("retry");
    expect(cardActionKind("cancelled")).toBe("retry");
  });

  test("keeps status text and color policy stable", () => {
    expect(libraryCardStatusText("complete")).toBe("Ready");
    expect(libraryCardStatusText("error")).toBe("Couldn't transcribe");
    expect(libraryCardStatusText("recording")).toBe("Recording");
    expect(libraryCardStatusText("cancelled")).toBe("Cancelled");
    expect(libraryCardStatusText("pending")).toBe("Queued");
    expect(cardStatusClass("error")).toBe("text-[var(--color-error)]");
    expect(cardStatusClass("recording")).toBe("text-[var(--color-accent)]");
    expect(cardStatusClass("complete")).toBe("text-content-muted");
  });

  test("formats valid dates and leaves invalid metadata empty", () => {
    const createdAt = "2026-08-17T14:05:00.000Z";
    const expected = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(createdAt));

    expect(formatCardCreatedAt(createdAt)).toBe(expected);
    expect(formatCardCreatedAt("not-a-date")).toBe("");
  });
});
