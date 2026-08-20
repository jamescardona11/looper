// AI reply action — runs LLM completion via AI SDK v6 (multi-model) and patches
// the assistant placeholder row as chunks arrive.
//
// Supports OpenAI, Anthropic, and Google AI models via @ai-sdk/* providers.
// Model selection is driven by AI_MODEL env var (see agent-config.ts).

import {
  getActiveModel,
  type RateLimitTier,
  SYSTEM_PROMPT,
  TOOL_USE_ENABLED,
} from "@looper/config/agent";
import { type LanguageModel, stepCountIs, streamText } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { resolveLanguageModel } from "./models";
import { buildTools } from "./tools";
import { buildModelMessages, latestTurnRequiresMemorySearch, runAssistantStream } from "./turn";
import {
  appendMemoryCitations,
  type MemoryCitation,
  memoryCitationsFromToolResults,
} from "./citations";

const PATCH_INTERVAL_MS = 250;

export const replyToThread = internalAction({
  args: { threadId: v.id("agentThreads"), userId: v.id("users") },
  handler: async (ctx, { threadId, userId }): Promise<void> => {
    const modelConfig = getActiveModel();

    const messageId = await ctx.runMutation(internal.agent.messages.createAssistantPlaceholder, {
      threadId,
      userId,
    });

    // BYOK: resolve the user's key for the *active* provider (openai/anthropic/
    // google). If they have one, it overrides the server key in resolveLanguageModel.
    const userKey: string | null = await ctx.runAction(
      internal.userKeys.keys._resolvePlaintextForUser,
      { userId, provider: modelConfig.provider },
    );

    // Per-user mock (Settings → Developer) OR the global MOCK_MODE env: canned
    // output so the chat works with zero provider keys.
    const mock = await ctx.runQuery(internal.mock.mockEnabledFor, { userId });

    let languageModel: LanguageModel;
    try {
      languageModel = resolveLanguageModel(modelConfig, userKey, mock);
    } catch (_err) {
      await ctx.runMutation(internal.agent.messages.finalizeAssistantMessage, {
        messageId,
        status: "error",
        finalContent:
          "No API key available for the configured model. " +
          "Add your own key in Settings → API Keys, or have an admin configure the server key.",
      });
      return;
    }

    let accumulated = "";
    const memoryCitations: MemoryCitation[] = [];
    try {
      const limitResult = await ctx.runMutation(internal.agent.credits.assertWithinLimit, {
        userId,
      });
      // Tools cost tokens: gate by tier (free tier off by default in
      // TOOL_USE_ENABLED), but always on for BYOK users since they pay with
      // their own key.
      const tier = (limitResult.tier ?? "free") as RateLimitTier;
      const toolsEnabled = ("byok" in limitResult && limitResult.byok) || TOOL_USE_ENABLED[tier];

      const history = await ctx.runQuery(internal.agent.reply._loadHistoryForReply, { threadId });

      const messages = buildModelMessages(history);
      const requiresMemorySearch = latestTurnRequiresMemorySearch(history);

      const startedAt = Date.now();
      const result = streamText({
        model: languageModel,
        system: SYSTEM_PROMPT,
        messages,
        // Allow tool → result → answer loops (v6 stops after 1 step otherwise).
        ...(toolsEnabled
          ? {
              tools: buildTools(ctx, userId),
              stopWhen: stepCountIs(5),
              prepareStep: ({ stepNumber }: { stepNumber: number }) =>
                requiresMemorySearch && stepNumber === 0
                  ? {
                      activeTools: ["searchLooperMemory"] as const,
                      toolChoice: {
                        type: "tool" as const,
                        toolName: "searchLooperMemory" as const,
                      },
                    }
                  : {},
              onStepFinish: ({ toolResults }: { toolResults: readonly unknown[] }) => {
                memoryCitations.push(
                  ...memoryCitationsFromToolResults(
                    toolResults as Array<{
                      toolName?: unknown;
                      output?: unknown;
                    }>,
                  ),
                );
              },
            }
          : {}),
      });

      const streamed = await runAssistantStream({
        textStream: result.textStream,
        patchIntervalMs: PATCH_INTERVAL_MS,
        patch: async (content) =>
          await ctx.runMutation(internal.agent.messages.appendAssistantChunk, {
            messageId,
            content,
          }),
        loadToolCalls: async () => await result.toolCalls,
        loadReasoning: async () => await (result as any).reasoningText,
        finalize: async ({ content, toolCalls, reasoning }) => {
          const finalContent = appendMemoryCitations(content, memoryCitations);
          await ctx.runMutation(internal.agent.messages.finalizeAssistantMessage, {
            messageId,
            status: "done",
            finalContent,
            toolCalls,
            reasoning,
          });
        },
        onContent: (content) => {
          accumulated = content;
        },
      });

      // Do not await usage after cancellation: providers may keep generating
      // after the local stream loop stops, which would make Stop feel blocked.
      if (streamed.canceled) return;

      const usage = await result.usage;
      const promptTokens = usage.inputTokens ?? 0;
      const completionTokens = usage.outputTokens ?? 0;

      // Report raw usage; agent/usage.ts owns deriving totalTokens + $ cost from
      // the model id (single owner of cost). BYOK usage counts too — the dashboard
      // tracks consumption regardless of who supplies the provider key.
      // Provider cast: schema accepts "google" after Convex regenerates types.
      await ctx.runMutation(internal.agent.usage.logUsage, {
        userId,
        threadId,
        model: modelConfig.model,
        provider: modelConfig.provider as any,
        promptTokens,
        completionTokens,
        durationMs: Date.now() - startedAt,
        toolCalls: streamed.toolCallCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      await ctx.runMutation(internal.agent.messages.finalizeAssistantMessage, {
        messageId,
        status: "error",
        finalContent: accumulated || `Error: ${msg}`,
      });
    }
  },
});

export const _loadHistoryForReply = internalQuery({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const all = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .collect();
    const usable = all.filter(
      (m) => m.role === "user" || (m.role === "assistant" && m.status === "done"),
    );
    return usable.map((message) => ({
      role: message.role,
      ...(message.role === "user" && message.memoryScope
        ? { memoryScope: message.memoryScope }
        : {}),
      content:
        message.role === "user" && message.memoryScope
          ? `${memoryScopeInstruction(message.memoryScope, message.meetingId)}\n\n${message.content}`
          : message.content,
    }));
  },
});

function memoryScopeInstruction(scope: string, meetingId?: string): string {
  const kinds =
    scope === "notes"
      ? '["note"]'
      : scope === "dictations"
        ? '["dictation"]'
        : scope === "meetings"
          ? '["meeting"]'
          : '["note","dictation","meeting"]';
  const meeting = meetingId ? ` and meetingId ${JSON.stringify(meetingId)}` : "";
  return `[Looper scope: call searchLooperMemory with kinds ${kinds}${meeting}. Do not broaden it.]`;
}
