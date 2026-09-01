import type { ComponentProps } from "react";
import { LibraryPlayerFooter } from "./LibraryPlayerFooter";
import { MeetingDocumentDock } from "../meeting/MeetingDocumentDock";

type LibraryAudioFooterProps = {
  meetingId?: string;
  meetingDockProps?: Omit<ComponentProps<typeof MeetingDocumentDock>, "id">;
  playerProps: ComponentProps<typeof LibraryPlayerFooter>;
};

export function LibraryAudioFooter({
  meetingId,
  meetingDockProps,
  playerProps,
}: LibraryAudioFooterProps) {
  if (meetingId && meetingDockProps) {
    return null;
  }

  return <LibraryPlayerFooter {...playerProps} />;
}
