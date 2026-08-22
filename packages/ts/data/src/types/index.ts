// @looper/data — shared domain types.
//
// Pure TypeScript. NO convex imports, NO Id<> brands: every id (threadId,
// messageId, storageId, userId, docId, uploadId, ...) is a plain `string` at the
// domain boundary. The Id<>/`as any` casts all live inside the convex adapter.
//
// These are the canonical shapes exposed by the Convex adapter. Definitions are
// taken verbatim from the authoritative design surface.

export type Tier = "free" | "pro" | "ultra";

export interface CreditsBalance {
  tier: Tier;
  byok: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  creditBalance: number;
  resetAtMs: number;
}

export interface SubscriptionState {
  tier: Tier;
  status: "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
  source: "stripe" | "polar" | "revenuecat" | "manual" | null;
  expiresAt: number | null;
  isLoading: boolean;
}

export interface AgentThread {
  _id: string;
  title: string;
  archived: boolean;
  pinned: boolean;
  lastMessageAt: number;
  messageCount: number;
}

export interface ThreadPreview {
  threadId: string | null;
  text: string | null;
}

export interface ChatMessage {
  _id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "done" | "error";
  toolCalls?: string;
  reasoning?: string;
  sources?: Array<{ title: string; docId: string }>;
  memoryScope?: AgentMemoryScope;
  meetingId?: string;
  createdAt: number;
}
// Identifiers are plain strings (Convex brands stay inside the adapter).

export interface AddUserMessageInput {
  threadId: string;
  content: string;
}

export type AgentMemoryScope = "all" | "notes" | "dictations" | "meetings";
export interface AgentMemoryContext {
  scope: AgentMemoryScope;
  meetingId?: string;
}

export type ApiKeyProvider = string; // 'openai' | 'anthropic' | 'deepgram' | ... (kept open per BYOK provider set)
export interface ProviderKeyStatus {
  provider: ApiKeyProvider;
  label: string;
  configured: boolean;
  createdAt: number | null;
  lastTestedAt: number | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}
export interface ApiKeyTestResult {
  ok: boolean;
  error: string | null;
}

export interface OnboardingState {
  currentStep: string | null;
  completedSteps: string[];
  skippedSteps: string[];
  isComplete: boolean;
}

export interface DictionaryEntry {
  id: string;
  term: string;
  createdAt: number;
}

export interface ReplacementRule {
  id: string;
  source: string;
  destination: string;
  createdAt: number;
}

export interface UserSnippet {
  id: string;
  trigger: string;
  expansion: string;
  createdAt: number;
}

export interface DictationSettingsDoc {
  id: string;
  data: unknown;
  version: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  kind?: "note" | "dictation";
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface DictationHistoryItem {
  id: string;
  text: string;
  source: "local" | "remote";
  sourceId: string | null;
  occurredAt: number;
  createdAt: number;
}

export type MeetingSessionState = "active" | "paused" | "ended";
export type MeetingTranscriptStatus = "partial" | "final";
export type MeetingContextKind = "text" | "document" | "image" | "link" | "note";

export interface MeetingSession {
  meetingId: string;
  title: string;
  state: MeetingSessionState;
  sharingEnabled: boolean;
  nextSequence: number;
  startedAt: number;
  lastActiveAt: number;
  endedAt: number | null;
}

export interface MeetingTranscriptSegment {
  id: string;
  meetingId: string;
  sequence: number;
  timestampMs: number;
  speaker: string | null;
  text: string;
  status: MeetingTranscriptStatus;
  createdAt: number;
}

export interface MeetingBrief {
  decisions: string[];
  tasks: string[];
  questions: string[];
  contextCount: number;
}

export interface MeetingContext {
  id: string;
  meetingId: string;
  kind: MeetingContextKind;
  title: string;
  content: string;
  sourceUrl: string | null;
  createdAt: number;
}

export interface MeetingEvidence {
  label: string;
  text: string;
}

export interface MeetingAnswer {
  answer: string;
  evidence: MeetingEvidence[];
}

export interface AudioUsageTotals {
  transcriptions: number;
  completed: number;
  failed: number;
  durationMs: number;
  processedBytes: number;
  storedBytes: number;
}

export interface AudioUsageDailyPoint extends AudioUsageTotals {
  dateMs: number;
}

export interface AudioUsageSnapshot {
  today: AudioUsageTotals;
  month: AudioUsageTotals;
  daily: AudioUsageDailyPoint[];
  byProvider: Record<string, AudioUsageTotals>;
  scope: "cloud";
}

export interface CheckoutResult {
  url: string;
}
export interface CheckoutInput {
  tier: "pro" | "ultra";
  interval: "monthly" | "yearly";
  successUrl: string;
  cancelUrl: string;
}
export interface PortalInput {
  returnUrl: string;
}
export interface OneTimeCheckoutInput {
  pack: string;
  successUrl: string;
  cancelUrl: string;
}
export interface PolarCheckoutInput {
  productKey: string;
  successUrl: string;
}

export interface CurrentUser {
  id: string; // backend _id, plain string (was me._id)
  email: string | null;
  name: string | null;
  isAnonymous: boolean;
}

export interface AnonymousViewer {
  userId: string;
  email?: string;
  name?: string;
  isAnonymous: boolean;
}
// Backed by the STRING-REF function 'upgrade:viewer' (not the typed api object).
// Loading = undefined; signed-out/no-viewer = null.

export type FeedbackKind = "bug" | "idea" | "praise" | "other";
export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  path?: string;
}
// Works signed-in OR anonymous.

export interface WaitlistJoinResult {
  referralCode: string;
  alreadyJoined: boolean;
}
export interface WaitlistStatus {
  position: number;
  referralCount: number;
}
export interface WaitlistJoinInput {
  email: string;
  referredBy?: string;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  tier: Tier;
  subscriptionStatus: string;
  joinedAt: number;
  isActive: boolean;
}
export interface SubscriptionStats {
  pro: number;
  ultra: number;
}
export interface AdminUsageStats {
  estimatedCostUsd: number;
  totalTokens: number;
  messages: number;
}
export interface AdminUsageByUser {
  userId: string;
  name: string | null;
  email: string | null;
  messages: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
export interface AdminUserDetails {
  email: string | null;
  name: string | null;
  tier: Tier;
  subscriptionStatus: string;
  joinedAt: number;
}

export interface MockMode {
  forced: boolean;
  enabled: boolean;
}
