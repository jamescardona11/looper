export type MemoryCitation = {
  kind: "note" | "dictation" | "meeting";
  title: string;
};

type ToolResultLike = {
  toolName?: unknown;
  output?: unknown;
};

export function memoryCitationsFromToolResults(
  toolResults: readonly ToolResultLike[],
): MemoryCitation[] {
  const citations: MemoryCitation[] = [];

  for (const result of toolResults) {
    if (result.toolName !== "searchLooperMemory" || !Array.isArray(result.output)) continue;

    for (const value of result.output) {
      if (!isMemoryCitation(value)) continue;
      citations.push({ kind: value.kind, title: value.title.trim() });
    }
  }

  return uniqueCitations(citations);
}

export function appendMemoryCitations(
  content: string,
  citations: readonly MemoryCitation[],
): string {
  const missing = uniqueCitations(citations)
    .map(citationMarker)
    .filter((marker) => !content.includes(marker));
  if (missing.length === 0) return content;

  const prefix = content.trimEnd();
  return `${prefix}${prefix ? "\n\n" : ""}Fuentes: ${missing.join(" ")}`;
}

function isMemoryCitation(value: unknown): value is MemoryCitation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; title?: unknown };
  return (
    (candidate.kind === "note" || candidate.kind === "dictation" || candidate.kind === "meeting") &&
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0
  );
}

function citationMarker({ kind, title }: MemoryCitation): string {
  const label = kind === "note" ? "Note" : kind === "dictation" ? "Dictation" : "Meeting";
  return `[${label}: ${title}]`;
}

function uniqueCitations(citations: readonly MemoryCitation[]): MemoryCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.kind}:${citation.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
