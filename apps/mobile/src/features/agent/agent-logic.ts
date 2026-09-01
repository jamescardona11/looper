import type { AgentMemoryScope } from "@looper/data";

export const agentScopes: Array<{ id: AgentMemoryScope; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "notes", label: "Notas" },
  { id: "dictations", label: "Dictados" },
  { id: "meetings", label: "Meetings" },
];

export interface AgentCitation {
  kind: "Note" | "Dictation" | "Meeting";
  title: string;
}

export type AnswerPart =
  | { kind: "text"; start: number; value: string }
  | { kind: "citation"; start: number; citation: AgentCitation };

const CITATION_PATTERN = /\[(Note|Dictation|Meeting):\s*([^\]]+)]/g;

export function citationsFromAnswer(answer: string): AgentCitation[] {
  const citations: AgentCitation[] = [];
  const seen = new Set<string>();
  for (const match of answer.matchAll(CITATION_PATTERN)) {
    const kind = match[1] as AgentCitation["kind"];
    const title = match[2]?.trim();
    if (!title) continue;
    const key = `${kind}:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ kind, title });
  }
  return citations;
}

/** Conserva las frases y sustituye únicamente la referencia por un chip inline. */
export function answerParts(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let cursor = 0;
  for (const match of answer.matchAll(CITATION_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) {
      parts.push({ kind: "text", start: cursor, value: answer.slice(cursor, index) });
    }
    const title = match[2]?.trim();
    if (title) {
      parts.push({
        kind: "citation",
        start: index,
        citation: { kind: match[1] as AgentCitation["kind"], title },
      });
    } else {
      parts.push({ kind: "text", start: index, value: match[0] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < answer.length) {
    parts.push({ kind: "text", start: cursor, value: answer.slice(cursor) });
  }
  return parts.length ? parts : [{ kind: "text", start: 0, value: answer }];
}
