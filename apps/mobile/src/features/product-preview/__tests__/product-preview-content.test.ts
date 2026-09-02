import type { MeetingContext, MeetingSession, Note } from "@looper/data";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_PREVIEW_MEETING_ID,
  productPreviewMeetingId,
  seedProductPreviewContent,
} from "../product-preview-content";

function commands() {
  let nextSequence = 1;
  return {
    meetingCommands: {
      addContext: vi.fn(async () => "context"),
      appendTranscript: vi.fn(async () => ({ nextSequence: ++nextSequence })),
      setState: vi.fn(async () => undefined),
      start: vi.fn(async () => ({ meetingId: PRODUCT_PREVIEW_MEETING_ID, nextSequence })),
    },
    noteCommands: { create: vi.fn(async () => "note") },
  };
}

describe("seedProductPreviewContent", () => {
  it("creates a complete product story for an empty preview account", async () => {
    const { meetingCommands, noteCommands } = commands();

    await seedProductPreviewContent({
      contexts: [],
      meeting: null,
      meetingCommands,
      noteCommands,
      notes: [],
    });

    expect(noteCommands.create).toHaveBeenCalledTimes(2);
    expect(meetingCommands.start).toHaveBeenCalledWith({
      meetingId: PRODUCT_PREVIEW_MEETING_ID,
      sharingEnabled: true,
      title: "Revisión de lanzamiento",
    });
    expect(meetingCommands.appendTranscript).toHaveBeenCalledTimes(3);
    expect(meetingCommands.addContext).toHaveBeenCalledTimes(2);
    expect(meetingCommands.setState).toHaveBeenCalledWith({
      meetingId: PRODUCT_PREVIEW_MEETING_ID,
      sharingEnabled: false,
      state: "ended",
    });
  });

  it("creates English preview content for an English capture", async () => {
    const { meetingCommands, noteCommands } = commands();

    await seedProductPreviewContent({
      contexts: [],
      locale: "en",
      meeting: null,
      meetingCommands,
      noteCommands,
      notes: [],
    });

    expect(noteCommands.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Onboarding idea" }),
    );
    expect(meetingCommands.start).toHaveBeenCalledWith({
      meetingId: productPreviewMeetingId("en"),
      sharingEnabled: true,
      title: "Launch review",
    });
    expect(meetingCommands.appendTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: productPreviewMeetingId("en"),
        text: "We decided to open the private beta on Friday with the product team.",
      }),
    );
  });

  it("does not duplicate content that is already complete", async () => {
    const { meetingCommands, noteCommands } = commands();
    const now = Date.now();
    const notes: Note[] = [
      {
        body: "existing",
        createdAt: now,
        id: "dictation",
        kind: "dictation",
        title: "Idea para el onboarding",
        updatedAt: now,
      },
      {
        body: "existing",
        createdAt: now,
        id: "note",
        title: "Principios del lanzamiento",
        updatedAt: now,
      },
    ];
    const meeting: MeetingSession = {
      endedAt: now,
      lastActiveAt: now,
      meetingId: PRODUCT_PREVIEW_MEETING_ID,
      nextSequence: 4,
      sharingEnabled: false,
      startedAt: now - 120_000,
      state: "ended",
      title: "Revisión de lanzamiento",
    };
    const contexts = ["Notas del meeting", "Momentos marcados"].map(
      (title, index): MeetingContext => ({
        content: "existing",
        createdAt: now + index,
        id: `context-${index}`,
        kind: "note",
        meetingId: PRODUCT_PREVIEW_MEETING_ID,
        sourceUrl: null,
        title,
      }),
    );

    await seedProductPreviewContent({
      contexts,
      meeting,
      meetingCommands,
      noteCommands,
      notes,
    });

    expect(noteCommands.create).not.toHaveBeenCalled();
    expect(meetingCommands.start).not.toHaveBeenCalled();
    expect(meetingCommands.appendTranscript).not.toHaveBeenCalled();
    expect(meetingCommands.addContext).not.toHaveBeenCalled();
    expect(meetingCommands.setState).not.toHaveBeenCalled();
  });
});
