// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import MeetingDetail from "./MeetingDetail";

const notesMutation = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
}));

const emptyDetails = vi.hoisted(() => ({
  library_item_id: "meeting-empty",
  started_at: "2026-08-11T14:00:00Z",
  ended_at: "2026-08-11T14:10:00Z",
  notes: "",
  notes_revision: 0,
  summary: null,
  summary_status: "idle" as const,
  summary_error: null,
  system_audio_enabled: false,
  recovered: false,
  calendar_context: null,
  note_markers: [],
  live_transcript: [],
}));

vi.mock("../queries", () => ({
  useMeetingDetails: () => ({ data: emptyDetails, isLoading: false }),
  useUpdateMeetingNotes: () => notesMutation,
  useGenerateMeetingSummary: () => ({
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }),
  useAskMeeting: () => ({ error: null, isPending: false, mutate: vi.fn() }),
}));

vi.mock("../../../data/library", () => ({
  getMeetingDetails: vi.fn(() => Promise.resolve(emptyDetails)),
}));

vi.mock("../../settings/local-llm-queries", () => ({
  useMeetingAiStatus: () => ({ data: { state: "ready" } }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "meeting.detail.notes_placeholder":
      "Write notes, decisions, and follow-ups while you listen...",
    "meeting.detail.notes_saved": "Notes saved locally",
    "meeting.detail.saving_notes": "Saving...",
  },
});

afterEach(() => {
  cleanup();
  notesMutation.mutateAsync.mockReset();
});

describe("MeetingDetail notes", () => {
  test("opens an editable note even when the meeting has no notes yet", async () => {
    notesMutation.mutateAsync.mockImplementation(({ update }) =>
      Promise.resolve({
        ...emptyDetails,
        notes: update.notes,
        notes_revision: 1,
      }),
    );

    render(
      <I18nProvider i18n={i18n}>
        <MeetingDetail
          id="meeting-empty"
          view="notes"
          segments={[]}
          audioAvailable={false}
          onPlayNote={vi.fn()}
        />
      </I18nProvider>,
    );

    const editor = screen.getByPlaceholderText(
      "Write notes, decisions, and follow-ups while you listen...",
    );
    expect((editor as HTMLTextAreaElement).value).toBe("");

    fireEvent.change(editor, { target: { value: "Decision: ship Friday" } });
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(notesMutation.mutateAsync).toHaveBeenCalledWith({
        id: "meeting-empty",
        update: {
          notes: "Decision: ship Friday",
          expected_revision: 0,
        },
      });
    });
  });
});
