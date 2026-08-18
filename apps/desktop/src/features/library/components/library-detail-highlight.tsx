import type { ReactNode } from "react";

export function highlightedTranscript(
  text: string,
  query: string,
  active: boolean,
): ReactNode {
  if (!query) return text;
  const source = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let found = source.indexOf(needle);
  let occurrence = 0;
  if (found < 0) return text;

  while (found >= 0) {
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark
        key={`${found}-${occurrence}`}
        className={
          active
            ? "transcript-search-hit transcript-search-hit-active"
            : "transcript-search-hit"
        }
      >
        {text.slice(found, found + needle.length)}
      </mark>,
    );
    cursor = found + needle.length;
    found = source.indexOf(needle, cursor);
    occurrence += 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
