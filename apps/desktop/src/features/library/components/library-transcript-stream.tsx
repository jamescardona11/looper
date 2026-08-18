import { motion } from "framer-motion";
import { Virtuoso } from "react-virtuoso";

import type { LibraryTranscriptPanelProps } from "./library-transcript-panel-types";
import { TranscriptProgress } from "./library-transcript-progress";

const STREAM_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};
const STREAM_CLASS = [
  "custom-scrollbar ui-text-body",
  "text-content-secondary leading-relaxed",
].join(" ");

type LibraryTranscriptStreamProps = Pick<
  LibraryTranscriptPanelProps,
  | "item"
  | "streamChunks"
  | "streamVirtuosoRef"
  | "activeStreamMatch"
  | "renderHighlightedText"
> & { transcribingLabel: string };

export function LibraryTranscriptStream({
  item,
  streamChunks,
  streamVirtuosoRef,
  activeStreamMatch,
  renderHighlightedText,
  transcribingLabel,
}: LibraryTranscriptStreamProps) {
  if (streamChunks.length === 0) {
    return <TranscriptProgress label={transcribingLabel} />;
  }

  return (
    <Virtuoso
      ref={streamVirtuosoRef}
      style={{ height: "100%" }}
      data={streamChunks}
      overscan={200}
      className={STREAM_CLASS}
      computeItemKey={(index) => `${item.id}-chunk-${index}`}
      components={{
        Header: () => <div className="h-2" />,
        Footer: () => <div className="h-2" />,
      }}
      itemContent={(position, chunk) => (
        <div className="pb-2 pr-4">
          <motion.p {...STREAM_MOTION} className="select-text">
            {renderHighlightedText(chunk, position === activeStreamMatch)}
          </motion.p>
        </div>
      )}
    />
  );
}
