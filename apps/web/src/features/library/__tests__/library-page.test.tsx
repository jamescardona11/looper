import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transcriptions: [] as Array<{
    id: string;
    text: string;
    source: "local" | "remote";
    sourceId: string | null;
    occurredAt: number;
    createdAt: number;
  }>,
  notes: [] as Array<{
    id: string;
    kind: "note" | "dictation";
    title: string;
    body: string;
    createdAt: number;
    updatedAt: number;
  }>,
  sessions: [] as Array<{
    meetingId: string;
    title: string;
    state: "active" | "paused" | "ended";
    sharingEnabled: boolean;
    nextSequence: number;
    startedAt: number;
    lastActiveAt: number;
    endedAt: number | null;
  }>,
  writeText: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useDictationHistory: () => ({ items: mocks.transcriptions, isLoading: false }),
  useNotes: () => ({ notes: mocks.notes, isLoading: false }),
  useMeetingSessions: () => ({ sessions: mocks.sessions, isLoading: false }),
  useMeetingDetail: () => ({
    session: null,
    transcript: [],
    contexts: [],
    brief: null,
    isLoading: false,
  }),
}));

vi.mock("@/shared/components/voice-tool-nav", () => ({
  VoiceToolNav: () => null,
}));

import { LibraryPage } from "../library-page";

beforeEach(() => {
  mocks.transcriptions.length = 0;
  mocks.notes.length = 0;
  mocks.sessions.length = 0;
  mocks.writeText.mockReset();
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(cleanup);

describe("LibraryPage", () => {
  it("exposes only synced reading surfaces", () => {
    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Library" })).toBeVisible();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Transcriptions0",
      "Notes0",
      "Meetings0",
    ]);
    expect(screen.queryByRole("button", { name: /record|listen|transcribe/i })).toBeNull();
  });

  it("renders and copies a synced Desktop transcription", async () => {
    mocks.transcriptions.push({
      id: "transcription-1",
      text: "Synced from Desktop.",
      source: "local",
      sourceId: "desktop-1",
      occurredAt: Date.UTC(2026, 7, 20, 12),
      createdAt: Date.UTC(2026, 7, 20, 12),
    });

    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith("Synced from Desktop."));
  });

  it("switches between synced notes and meetings", () => {
    mocks.notes.push({
      id: "note-1",
      kind: "note",
      title: "Follow-up",
      body: "Send the proposal.",
      createdAt: 1,
      updatedAt: 1,
    });
    mocks.sessions.push({
      meetingId: "meeting-1",
      title: "Pricing review",
      state: "ended",
      sharingEnabled: true,
      nextSequence: 2,
      startedAt: 1,
      lastActiveAt: 2,
      endedAt: 3,
    });

    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(screen.getByText("Send the proposal.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Meetings/ }));
    expect(screen.getByRole("button", { name: /Pricing review/ })).toBeVisible();
  });
});
