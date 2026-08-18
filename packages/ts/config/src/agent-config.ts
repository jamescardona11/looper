// Shared agent configuration. Edit this file to tune system prompt, model
// selection, rate limits per tier, and cost estimates.
//
// Imported by backend (Convex actions) and clients (web + mobile).
//
// The provider switch (openai / anthropic) is env-driven so you can A/B test
// without redeploying app code.

export type AIProvider = "openai" | "anthropic" | "google";

export interface ModelConfig {
  provider: AIProvider;
  model: string;
  // Approximate cost per 1M tokens, in USD. Used for cost-tracking display only.
  // Provider invoices remain the source of truth for actual spend.
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export const MODELS: Record<string, ModelConfig> = {
  // OpenAI
  "gpt-4.1": {
    provider: "openai",
    model: "gpt-4.1",
    inputCostPer1M: 2,
    outputCostPer1M: 8,
  },
  "gpt-4o": {
    provider: "openai",
    model: "gpt-4o",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  "gpt-4o-mini": {
    provider: "openai",
    model: "gpt-4o-mini",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  o3: {
    provider: "openai",
    model: "o3",
    inputCostPer1M: 10,
    outputCostPer1M: 40,
  },
  "o4-mini": {
    provider: "openai",
    model: "o4-mini",
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
  },
  // Anthropic
  "claude-opus-4-7": {
    provider: "anthropic",
    model: "claude-opus-4-7",
    inputCostPer1M: 5,
    outputCostPer1M: 25,
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    inputCostPer1M: 1,
    outputCostPer1M: 5,
  },
  // Google AI
  "gemini-2.5-pro": {
    provider: "google",
    model: "gemini-2.5-pro",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
  },
  "gemini-2.5-flash": {
    provider: "google",
    model: "gemini-2.5-flash",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  "gemini-2.5-flash-lite": {
    provider: "google",
    model: "gemini-2.5-flash-lite",
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.2,
  },
};

// The model key (a key of MODELS) selected by the server environment.
export function getActiveModelKey(): string {
  return process.env.AI_MODEL ?? "gpt-4o-mini";
}

// Resolve the active model from env. Default to a cheap, fast model for development.
export function getActiveModel(): ModelConfig {
  const key = getActiveModelKey();
  const config = MODELS[key];
  if (!config) {
    throw new Error(
      `Unknown AI_MODEL: ${key}. Add it to MODELS in lib/agent-config.ts, or use one of: ${Object.keys(MODELS).join(", ")}`,
    );
  }
  return config;
}

// Edit this to describe your app's voice and what the agent should help with.
// Keep it under ~500 tokens. Use specific examples; avoid generic "be helpful" prose.
export const SYSTEM_PROMPT = `You are Looper's private recording assistant.

Your job is to help the user understand, organize, rewrite, summarize, translate,
and reuse their saved notes, dictations, and meeting transcripts. You have no access to the public web,
the user's screen, or unsynced local audio.

Guidelines:
- Be direct and specific. Avoid hedging language.
- Search Looper memory only when the user explicitly asks to recall, compare,
  summarize, or reuse saved content.
- A scoped question about notes, dictations, or meetings always requires a
  searchLooperMemory call, even when you expect the collection to be empty.
- Respect any Looper scope instruction in a user turn. Pass its requested kinds or
  meetingId to searchLooperMemory and never broaden that scope.
- Cite every saved item you rely on inline as [Note: title], [Dictation: date], or
  [Meeting: title]. Do not invent citations.
- Treat text supplied in the conversation as recording-derived context unless the
  user says otherwise.
- If a tool returns no results, say "No encontré" matching items and suggest
  what to try next. Never describe an empty result as lacking access.
- Format responses in markdown. Use code blocks for code, lists for steps.
- Do not make up information you do not have access to.

Tools available: see the tool definitions provided.`;

// Rate limits per tier, in messages per day. -1 means unlimited.
// If payments-unified extra is installed, the limit is read from users.subscription;
// otherwise everyone is treated as 'free' tier.
export type RateLimitTier = "free" | "pro" | "ultra";

export const RATE_LIMITS: Record<
  RateLimitTier,
  { messagesPerDay: number; maxTokensPerResponse: number }
> = {
  free: { messagesPerDay: 10, maxTokensPerResponse: 2000 },
  pro: { messagesPerDay: 100, maxTokensPerResponse: 4000 },
  ultra: { messagesPerDay: -1, maxTokensPerResponse: 8000 },
};

// Memory retrieval is core Agent behavior; per-tier message limits still bound spend.
export const TOOL_USE_ENABLED: Record<RateLimitTier, boolean> = {
  free: true,
  pro: true,
  ultra: true,
};

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: ModelConfig,
): number {
  return (
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M
  );
}

// Credit cost per paid action, charged beyond the daily message allowance.
// Buyers tune these weights to their own unit economics.
export const FEATURE_CREDIT_COST = {
  agentMessage: 1,
  transcription: 1, // per file or streaming transcription
} as const;
