import type { ReactNode } from "react";
import type { TranscriptSegment } from "../../../contracts";
import {
  MeetingReviewPanel,
  type MeetingReviewView,
} from "./MeetingReviewPanel";

type MeetingDocumentWorkspaceProps = {
  id: string;
  title: string;
  createdAtLabel: string | null;
  durationSeconds: number;
  modelLabel: string;
  tags: string[];
  speakerCount: number;
  view: MeetingReviewView;
  onViewChange: (view: MeetingReviewView) => void;
  segments?: TranscriptSegment[] | null;
  audioAvailable: boolean;
  onPlayNote: (timestampMs: number) => void;
  transcriptPanel: ReactNode;
};

export function MeetingDocumentWorkspace(props: MeetingDocumentWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <MeetingReviewPanel {...props} />
    </div>
  );
}
