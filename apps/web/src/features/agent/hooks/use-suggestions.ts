import { useMemo } from "react";
import type { ChatMessage } from "./use-messages";

// Suggested prompts, derived purely from the latest assistant reply — no
// extra LLM call, so it costs nothing and behaves identically under MOCK_MODE.
// Returns up to 3 short prompts the user can tap to continue the conversation.
const GENERIC_KEYS = [
  "agent.suggestSimpler",
  "agent.suggestExample",
  "agent.suggestNextSteps",
] as const;

type TFn = (key: string) => string;

export function useSuggestions(messages: ChatMessage[], t: TFn): string[] {
  return useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.status !== "done" || !last.content.trim()) {
      return [];
    }

    const out: string[] = [];
    const added = new Set<string>();
    const add = (suggestion: string) => {
      if (added.has(suggestion)) return;
      out.push(suggestion);
      added.add(suggestion);
    };
    if (/\b(step|steps|first|then|finally)\b/i.test(last.content)) {
      add(t("agent.suggestChecklist"));
    }
    for (const key of GENERIC_KEYS) {
      if (out.length >= 3) break;
      add(t(key));
    }
    return out.slice(0, 3);
  }, [messages, t]);
}
