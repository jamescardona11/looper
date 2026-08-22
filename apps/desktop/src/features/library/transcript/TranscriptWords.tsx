import { Fragment } from "react";

import {
  type TranscriptUnderline,
  useTranscriptWordsUnderline,
} from "./transcript-words-underline";

type TranscriptWordsProps = {
  tokens: string[];
  activePosition: number;
};

export const TranscriptWords = ({
  tokens,
  activePosition,
}: TranscriptWordsProps) => {
  const { containerRef, underline } = useTranscriptWordsUnderline(
    activePosition,
    tokens,
  );

  return (
    <span ref={containerRef} className="transcript-words select-text">
      {tokens.map((token, position) => (
        <TranscriptToken
          key={position}
          token={token}
          position={position}
          active={position === activePosition}
        />
      ))}
      {underline && (
        <TranscriptUnderlineMarker
          geometry={underline}
          visible={activePosition >= 0}
        />
      )}
    </span>
  );
};

function TranscriptToken({
  token,
  position,
  active,
}: {
  token: string;
  position: number;
  active: boolean;
}) {
  const className = active
    ? "transcript-word transcript-word-active"
    : "transcript-word";

  return (
    <Fragment>
      {position === 0 ? null : " "}
      <span data-word-active={active || undefined} className={className}>
        {token}
      </span>
    </Fragment>
  );
}

function TranscriptUnderlineMarker({
  geometry,
  visible,
}: {
  geometry: TranscriptUnderline;
  visible: boolean;
}) {
  return (
    <span
      className="transcript-word-underline"
      aria-hidden="true"
      style={{
        transform: `translate(${geometry.x}px, ${geometry.y}px)`,
        width: geometry.width,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}
