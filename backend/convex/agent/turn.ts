// Testable assistant-turn behavior with impure I/O injected. reply.ts owns
// model selection and usage logging; this module owns message preparation and
// the streaming lifecycle (patch cadence, cancellation, metadata, finalization).

import type { ModelMessage } from "ai";

// A private text turn loaded by reply._loadHistoryForReply.
export type HistoryEntry = {
  role: "user" | "assistant";
  content: string;
  memoryScope?: string;
};

export function buildModelMessages(history: readonly HistoryEntry[]): ModelMessage[] {
  return history.map((message) => ({ role: message.role, content: message.content }));
}

export function latestTurnRequiresMemorySearch(history: readonly HistoryEntry[]): boolean {
  const latest = history.at(-1);
  return latest?.role === "user" && Boolean(latest.memoryScope);
}

// Throttle decision for the streaming patch loop: flush the accumulated buffer
// to the DB only once the patch interval has elapsed since the last patch.
// Strictly-greater-than preserves reply.ts's original `now - lastPatchAt >
// PATCH_INTERVAL_MS` cadence exactly (a patch exactly at the boundary waits).
export function shouldFlushPatch(now: number, lastPatchAt: number, intervalMs: number): boolean {
  return now - lastPatchAt > intervalMs;
}

type AssistantStreamFinal = {
  content: string;
  toolCalls?: string;
  reasoning?: string;
};

export type AssistantStreamArgs = {
  textStream: AsyncIterable<string>;
  patchIntervalMs: number;
  now?: () => number;
  patch: (content: string) => Promise<{ canceled?: boolean } | null | undefined>;
  loadToolCalls: () => Promise<readonly { toolName?: unknown }[] | undefined>;
  loadReasoning: () => Promise<unknown>;
  finalize: (result: AssistantStreamFinal) => Promise<void>;
  onContent?: (content: string) => void;
};

export type AssistantStreamResult = {
  canceled: boolean;
  content: string;
  toolCallCount: number;
};

export async function runAssistantStream({
  textStream,
  patchIntervalMs,
  now = Date.now,
  patch,
  loadToolCalls,
  loadReasoning,
  finalize,
  onContent,
}: AssistantStreamArgs): Promise<AssistantStreamResult> {
  let content = "";
  let lastPatchAt = 0;

  for await (const delta of textStream) {
    content += delta;
    onContent?.(content);

    const currentTime = now();
    if (!shouldFlushPatch(currentTime, lastPatchAt, patchIntervalMs)) continue;

    const patchResult = await patch(content);
    lastPatchAt = currentTime;
    if (patchResult?.canceled) {
      await finalize({ content });
      return { canceled: true, content, toolCallCount: 0 };
    }
  }

  let toolCalls: string | undefined;
  let toolCallCount = 0;
  try {
    const calls = await loadToolCalls();
    if (calls && calls.length > 0) {
      toolCallCount = calls.length;
      toolCalls = JSON.stringify(calls.map((call) => ({ name: call.toolName })));
    }
  } catch {
    // Optional provider metadata.
  }

  let reasoning: string | undefined;
  try {
    const value = await loadReasoning();
    if (typeof value === "string" && value.length > 0) reasoning = value;
  } catch {
    // Optional provider metadata.
  }

  await finalize({ content, toolCalls, reasoning });
  return { canceled: false, content, toolCallCount };
}
