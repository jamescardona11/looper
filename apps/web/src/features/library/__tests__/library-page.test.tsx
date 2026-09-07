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
  meetingDetail: {
    session: null as null | {
      meetingId: string;
      title: string;
      state: "active" | "paused" | "ended";
      sharingEnabled: boolean;
      nextSequence: number;
      startedAt: number;
      lastActiveAt: number;
      endedAt: number | null;
    },
    transcript: [] as Array<{ id: string; speaker: string | null; text: string }>,
    contexts: [],
    brief: null as null | {
      decisions: string[];
      tasks: string[];
      questions: string[];
    },
    isLoading: false,
  },
  writeText: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useDictationHistory: () => ({ items: mocks.transcriptions, isLoading: false }),
  useNotes: () => ({ notes: mocks.notes, isLoading: false }),
  useMeetingSessions: () => ({ sessions: mocks.sessions, isLoading: false }),
  useMeetingDetail: () => mocks.meetingDetail,
}));

import { LibraryPage } from "../library-page";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

beforeEach(() => {
  mocks.transcriptions.length = 0;
  mocks.notes.length = 0;
  mocks.sessions.length = 0;
  mocks.meetingDetail.session = null;
  mocks.meetingDetail.transcript.length = 0;
  mocks.meetingDetail.brief = null;
  mocks.meetingDetail.isLoading = false;
  mocks.writeText.mockReset();
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(cleanup);

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

describe("LibraryPage", () => {
  it("exposes only synced reading surfaces", () => {
    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Your notes and recordings." })).toBeVisible();
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
    fireEvent.click(screen.getByRole("button", { name: /Follow-up/ }));
    expect(screen.getByRole("heading", { name: "Follow-up" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("tab", { name: /Meetings/ }));
    expect(screen.getByRole("button", { name: /Pricing review/ })).toBeVisible();
  });

  it("renders a synced note as a readable document and copies its source", async () => {
    mocks.notes.push({
      id: "note-structured",
      kind: "note",
      title: "Launch review",
      body: "## Decisions\n\n- Ship the new onboarding\n- Review activation",
      createdAt: Date.UTC(2026, 7, 20, 12),
      updatedAt: Date.UTC(2026, 7, 21, 15, 30),
    });

    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    fireEvent.click(screen.getByRole("button", { name: /Launch review/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Decisions" })).toBeVisible();
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.queryByText(/## Decisions/)).toBeNull();
    expect(screen.getByText(/Created/)).toBeVisible();
    expect(screen.getByText(/Last updated/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy note" }));
    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith(
        "## Decisions\n\n- Ship the new onboarding\n- Review activation",
      );
    });
    expect(screen.getByRole("button", { name: "Copied!" })).toBeVisible();
  });

  it("shows a plain-text preview for Markdown notes", () => {
    mocks.notes.push({
      id: "note-preview",
      kind: "note",
      title: "Launch review",
      body: "## Decisions\n\n- Ship the new onboarding\n- Review activation",
      createdAt: Date.UTC(2026, 7, 20, 12),
      updatedAt: Date.UTC(2026, 7, 21, 15, 30),
    });

    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));

    expect(screen.getByText("Decisions Ship the new onboarding Review activation")).toBeVisible();
    expect(screen.queryByText(/## Decisions/)).toBeNull();
  });

  it("uses a focused meeting detail on narrow screens", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 1023px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const meeting = {
      meetingId: "meeting-mobile",
      title: "Mobile product review",
      state: "ended" as const,
      sharingEnabled: true,
      nextSequence: 2,
      startedAt: Date.UTC(2026, 7, 20, 12),
      lastActiveAt: Date.UTC(2026, 7, 20, 13),
      endedAt: Date.UTC(2026, 7, 20, 13),
    };
    mocks.sessions.push(meeting);
    mocks.meetingDetail.session = meeting;
    mocks.meetingDetail.transcript.push({
      id: "segment-1",
      speaker: "Maya",
      text: "Keep the recording state visible.",
    });

    render(
      <I18nProvider defaultLocale="en">
        <LibraryPage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Meetings/ }));
    expect(screen.queryByRole("heading", { name: "Mobile product review" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Mobile product review/ }));
    expect(screen.getByRole("heading", { name: "Mobile product review" })).toBeVisible();
    expect(screen.getByText("Keep the recording state visible.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("heading", { name: "Mobile product review" })).toBeNull();
    expect(screen.getByRole("button", { name: /Mobile product review/ })).toBeVisible();
  });
});
