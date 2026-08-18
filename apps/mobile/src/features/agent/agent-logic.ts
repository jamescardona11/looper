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

export function citationsFromAnswer(answer: string): AgentCitation[] {
  const citations: AgentCitation[] = [];
  const seen = new Set<string>();
  for (const match of answer.matchAll(/\[(Note|Dictation|Meeting):\s*([^\]]+)]/g)) {
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
