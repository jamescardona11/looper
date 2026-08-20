import { MeetingCapture } from "./how-it-works/meeting-capture";
import { SourceBehindTheText } from "./how-it-works/source-behind-the-text";
import { SpeakAnywhere } from "./how-it-works/speak-anywhere";

export { MeetingCapture } from "./how-it-works/meeting-capture";
export { SourceBehindTheText } from "./how-it-works/source-behind-the-text";
export { SpeakAnywhere } from "./how-it-works/speak-anywhere";

/**
 * The three beats, in the order the approved design runs them: a split, a full
 * width band that breaks the rhythm, then the split reversed. They are exported
 * individually as well, in case the page wants to interleave something between
 * them, but the design puts nothing between them.
 */
export function HowItWorks() {
  return (
    <>
      <SpeakAnywhere />
      <MeetingCapture />
      <SourceBehindTheText />
    </>
  );
}
