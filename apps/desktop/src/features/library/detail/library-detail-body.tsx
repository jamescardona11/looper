import type { ComponentProps, ReactNode } from "react";

import { LibraryAudioFooter } from "../player/LibraryAudioFooter";
import { MeetingDocumentWorkspace } from "../meeting/MeetingDocumentWorkspace";

type LibraryDetailBodyProps = {
  meeting: boolean;
  transcriptPanel: ReactNode;
  workspace: Omit<
    ComponentProps<typeof MeetingDocumentWorkspace>,
    "transcriptPanel"
  >;
  footer: ComponentProps<typeof LibraryAudioFooter>;
};

export function LibraryDetailBody({
  footer,
  meeting,
  transcriptPanel,
  workspace,
}: LibraryDetailBodyProps) {
  return (
    <>
      {meeting ? (
        <MeetingDocumentWorkspace
          {...workspace}
          meetingDockProps={footer.meetingDockProps}
          transcriptPanel={transcriptPanel}
        />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {transcriptPanel}
        </div>
      )}
      <LibraryAudioFooter {...footer} />
    </>
  );
}
