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
import type { MeetingDetails } from "../../../../contracts";
import MeetingDetail from "../MeetingDetail";

const notesMutation = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
}));

const meetingQuery = vi.hoisted(() => ({
  data: undefined as MeetingDetails | undefined,
  isLoading: false,
  refetch: vi.fn(),
}));

const emptyDetails = vi.hoisted<MeetingDetails>(() => ({
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

vi.mock("../../queries", () => ({
  useMeetingDetails: () => meetingQuery,
  useUpdateMeetingNotes: () => notesMutation,
  useGenerateMeetingSummary: () => ({
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }),
  useAskMeeting: () => ({ error: null, isPending: false, mutate: vi.fn() }),
}));

vi.mock("../../../../data/library", () => ({
  getMeetingDetails: vi.fn(() => Promise.resolve(emptyDetails)),
}));

vi.mock("../../../settings/models/local-llm-queries", () => ({
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
  emptyDetails.note_markers = [];
  emptyDetails.live_transcript = [];
  meetingQuery.data = emptyDetails;
  meetingQuery.isLoading = false;
  meetingQuery.refetch.mockReset();
});

meetingQuery.data = emptyDetails;

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

  test("keeps a failed detail retryable instead of loading forever", () => {
    meetingQuery.data = undefined;

    render(
      <I18nProvider i18n={i18n}>
        <MeetingDetail
          id="missing-meeting"
          view="notes"
          segments={[]}
          audioAvailable={false}
          onPlayNote={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(meetingQuery.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Loading...")).toBeNull();
  });
});

describe("MeetingDetail moments", () => {
  test("expands a marked source independently from playing its audio", () => {
    emptyDetails.note_markers = [
      {
        id: "moment-1",
        captured_at_ms: 90_000,
        start_ms: 84_000,
        end_ms: 96_000,
        created_at: "2026-08-11T14:01:30Z",
      },
    ];
    const onPlayNote = vi.fn();

    render(
      <I18nProvider i18n={i18n}>
        <MeetingDetail
          id="meeting-empty"
          view="moments"
          segments={[
            {
              start_ms: 84_000,
              end_ms: 96_000,
              text: "Keep the shortcut discoverable in daily use.",
            },
          ]}
          audioAvailable
          onPlayNote={onPlayNote}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Captured moment/ }));

    expect(screen.getByText("Source").isConnected).toBe(true);
    expect(
      screen.getAllByText("Keep the shortcut discoverable in daily use."),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));

    expect(onPlayNote).toHaveBeenCalledWith(84_000);
  });
});
