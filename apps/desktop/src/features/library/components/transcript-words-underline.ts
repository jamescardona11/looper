import { useLayoutEffect, useRef, useState } from "react";

export type TranscriptUnderline = {
  x: number;
  y: number;
  width: number;
};

function findActiveWord(container: HTMLSpanElement) {
  for (const child of container.children) {
    if (child instanceof HTMLElement && child.dataset.wordActive === "true") {
      return child;
    }
  }
  return null;
}

function measureUnderline(activeWord: HTMLElement): TranscriptUnderline {
  return {
    x: activeWord.offsetLeft,
    y: activeWord.offsetTop + activeWord.offsetHeight - 2,
    width: activeWord.offsetWidth,
  };
}

export function useTranscriptWordsUnderline(
  activePosition: number,
  tokens: string[],
) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [underline, setUnderline] = useState<TranscriptUnderline | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeWord = findActiveWord(container);
    if (activeWord) setUnderline(measureUnderline(activeWord));
  }, [activePosition, tokens]);

  return { containerRef, underline };
}
