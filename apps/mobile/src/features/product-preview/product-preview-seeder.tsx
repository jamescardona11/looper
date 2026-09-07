import {
  useMeetingCommands,
  useMeetingDetail,
  useMeetingSessions,
  useNoteCommands,
  useNotes,
} from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { useEffect, useRef } from "react";
import { productPreviewMeetingId, seedProductPreviewContent } from "./product-preview-content";

/** Adds deterministic content only to local builds made explicitly for product captures. */
export function ProductPreviewSeeder() {
  const { locale } = useTranslation();
  const meetingId = productPreviewMeetingId(locale);
  const notes = useNotes();
  const sessions = useMeetingSessions();
  const detail = useMeetingDetail(meetingId);
  const noteCommands = useNoteCommands();
  const meetingCommands = useMeetingCommands();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || notes.isLoading || sessions.isLoading || detail.isLoading) return;
    started.current = true;
    void seedProductPreviewContent({
      contexts: detail.contexts,
      meeting: detail.session,
      meetingCommands,
      noteCommands,
      notes: notes.notes,
      locale,
    }).catch((cause: unknown) => {
      console.error("Could not seed product preview content", cause);
    });
  }, [detail, locale, meetingCommands, noteCommands, notes, sessions.isLoading]);

  return null;
}
