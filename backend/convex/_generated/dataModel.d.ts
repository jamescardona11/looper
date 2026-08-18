/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  adminUsers: {
    document: {
      userId: Id<"users">;
      _id: Id<"adminUsers">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  agentMessages: {
    document: {
      canceled?: boolean;
      content: string;
      createdAt: number;
      feedback?: "up" | "down";
      meetingId?: string;
      memoryScope?: "all" | "notes" | "dictations" | "meetings";
      reasoning?: string;
      role: "user" | "assistant";
      status?: "streaming" | "done" | "error";
      threadId: Id<"agentThreads">;
      toolCalls?: string;
      userId: Id<"users">;
      _id: Id<"agentMessages">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "canceled"
      | "content"
      | "createdAt"
      | "feedback"
      | "meetingId"
      | "memoryScope"
      | "reasoning"
      | "role"
      | "status"
      | "threadId"
      | "toolCalls"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_thread: ["threadId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  agentThreads: {
    document: {
      archived: boolean;
      componentThreadId?: string;
      lastMessageAt: number;
      messageCount: number;
      pinned: boolean;
      title: string;
      userId: Id<"users">;
      _id: Id<"agentThreads">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "archived"
      | "componentThreadId"
      | "lastMessageAt"
      | "messageCount"
      | "pinned"
      | "title"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_recent: ["userId", "archived", "lastMessageAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  agentUsage: {
    document: {
      completionTokens: number;
      createdAt: number;
      durationMs: number;
      estimatedCostUsd: number;
      model: string;
      promptTokens: number;
      provider: "openai" | "anthropic" | "google";
      threadId: Id<"agentThreads">;
      toolCalls: number;
      totalTokens: number;
      userId: Id<"users">;
      _id: Id<"agentUsage">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completionTokens"
      | "createdAt"
      | "durationMs"
      | "estimatedCostUsd"
      | "model"
      | "promptTokens"
      | "provider"
      | "threadId"
      | "toolCalls"
      | "totalTokens"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_created: ["createdAt", "_creationTime"];
      by_user_recent: ["userId", "createdAt", "_creationTime"];
      by_user_thread: ["userId", "threadId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authAccounts: {
    document: {
      emailVerified?: string;
      phoneVerified?: string;
      provider: string;
      providerAccountId: string;
      secret?: string;
      userId: Id<"users">;
      _id: Id<"authAccounts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "emailVerified"
      | "phoneVerified"
      | "provider"
      | "providerAccountId"
      | "secret"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      providerAndAccountId: ["provider", "providerAccountId", "_creationTime"];
      userIdAndProvider: ["userId", "provider", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authRateLimits: {
    document: {
      attemptsLeft: number;
      identifier: string;
      lastAttemptTime: number;
      _id: Id<"authRateLimits">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attemptsLeft"
      | "identifier"
      | "lastAttemptTime";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      identifier: ["identifier", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authRefreshTokens: {
    document: {
      expirationTime: number;
      firstUsedTime?: number;
      parentRefreshTokenId?: Id<"authRefreshTokens">;
      sessionId: Id<"authSessions">;
      _id: Id<"authRefreshTokens">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expirationTime"
      | "firstUsedTime"
      | "parentRefreshTokenId"
      | "sessionId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      sessionId: ["sessionId", "_creationTime"];
      sessionIdAndParentRefreshTokenId: [
        "sessionId",
        "parentRefreshTokenId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authSessions: {
    document: {
      expirationTime: number;
      userId: Id<"users">;
      _id: Id<"authSessions">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "expirationTime" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authVerificationCodes: {
    document: {
      accountId: Id<"authAccounts">;
      code: string;
      emailVerified?: string;
      expirationTime: number;
      phoneVerified?: string;
      provider: string;
      verifier?: string;
      _id: Id<"authVerificationCodes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accountId"
      | "code"
      | "emailVerified"
      | "expirationTime"
      | "phoneVerified"
      | "provider"
      | "verifier";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      accountId: ["accountId", "_creationTime"];
      code: ["code", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authVerifiers: {
    document: {
      sessionId?: Id<"authSessions">;
      signature?: string;
      _id: Id<"authVerifiers">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "sessionId" | "signature";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      signature: ["signature", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  creditBalance: {
    document: {
      balance: number;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"creditBalance">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "balance" | "updatedAt" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  creditTransactions: {
    document: {
      amount: number;
      balanceAfter: number;
      createdAt: number;
      idempotencyKey: string;
      reason?: string;
      type: "grant" | "topup" | "consume" | "refund" | "adjustment";
      userId: Id<"users">;
      _id: Id<"creditTransactions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amount"
      | "balanceAfter"
      | "createdAt"
      | "idempotencyKey"
      | "reason"
      | "type"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_idempotency: ["idempotencyKey", "_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dictionaryEntries: {
    document: {
      createdAt: number;
      term: string;
      userId: Id<"users">;
      _id: Id<"dictionaryEntries">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "term" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  feedback: {
    document: {
      createdAt: number;
      kind: "bug" | "idea" | "praise" | "other";
      message: string;
      path?: string;
      rating?: number;
      status: "new" | "triaged" | "resolved";
      userId?: Id<"users">;
      _id: Id<"feedback">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "kind"
      | "message"
      | "path"
      | "rating"
      | "status"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_status: ["status", "createdAt", "_creationTime"];
      by_user: ["userId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  meetingCompanionDevices: {
    document: {
      deviceId: string;
      lastActiveAt: number;
      meetingId: string;
      name: string;
      userId: Id<"users">;
      _id: Id<"meetingCompanionDevices">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "deviceId"
      | "lastActiveAt"
      | "meetingId"
      | "name"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_meeting: ["userId", "meetingId", "lastActiveAt", "_creationTime"];
      by_user_meeting_device: [
        "userId",
        "meetingId",
        "deviceId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  meetingContexts: {
    document: {
      content: string;
      createdAt: number;
      kind: "text" | "document" | "image" | "link" | "note";
      meetingId: string;
      sourceUrl?: string;
      title: string;
      userId: Id<"users">;
      _id: Id<"meetingContexts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "content"
      | "createdAt"
      | "kind"
      | "meetingId"
      | "sourceUrl"
      | "title"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_meeting_created: [
        "userId",
        "meetingId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  meetingOutputRequests: {
    document: {
      confirmedAt?: number;
      createdAt: number;
      deliveredAt?: number;
      deliveryClaimId?: string;
      deliveryClaimedAt?: number;
      deliveryStatus?: "pending" | "claimed" | "delivered";
      meetingId: string;
      preview: string;
      status: "pending" | "confirmed" | "cancelled";
      userId: Id<"users">;
      _id: Id<"meetingOutputRequests">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "confirmedAt"
      | "createdAt"
      | "deliveredAt"
      | "deliveryClaimedAt"
      | "deliveryClaimId"
      | "deliveryStatus"
      | "meetingId"
      | "preview"
      | "status"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_delivery: ["userId", "deliveryStatus", "_creationTime"];
      by_user_meeting_created: [
        "userId",
        "meetingId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  meetingSessions: {
    document: {
      endedAt?: number;
      lastActiveAt: number;
      meetingId: string;
      nextSequence: number;
      sharingEnabled: boolean;
      startedAt: number;
      state: "active" | "paused" | "ended";
      title: string;
      userId: Id<"users">;
      _id: Id<"meetingSessions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "endedAt"
      | "lastActiveAt"
      | "meetingId"
      | "nextSequence"
      | "sharingEnabled"
      | "startedAt"
      | "state"
      | "title"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_active: ["userId", "state", "lastActiveAt", "_creationTime"];
      by_user_activity: ["userId", "lastActiveAt", "_creationTime"];
      by_user_meeting: ["userId", "meetingId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  meetingTranscriptSegments: {
    document: {
      createdAt: number;
      meetingId: string;
      sequence: number;
      speaker?: string;
      status: "partial" | "final";
      text: string;
      timestampMs: number;
      userId: Id<"users">;
      _id: Id<"meetingTranscriptSegments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "meetingId"
      | "sequence"
      | "speaker"
      | "status"
      | "text"
      | "timestampMs"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_meeting_sequence: [
        "userId",
        "meetingId",
        "sequence",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  notes: {
    document: {
      body: string;
      createdAt: number;
      kind?: "note" | "dictation";
      sourceId?: string;
      title: string;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"notes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "body"
      | "createdAt"
      | "kind"
      | "sourceId"
      | "title"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_source: ["userId", "sourceId", "_creationTime"];
      by_user_updated: ["userId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  onboardingStates: {
    document: {
      completedAt?: number;
      completedSteps: Array<string>;
      currentStep: string;
      isComplete: boolean;
      payload?: string;
      skippedSteps: Array<string>;
      startedAt: number;
      userId: Id<"users">;
      _id: Id<"onboardingStates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "completedSteps"
      | "currentStep"
      | "isComplete"
      | "payload"
      | "skippedSteps"
      | "startedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  paymentEvents: {
    document: {
      error?: string;
      eventId: string;
      eventType: string;
      payload: string;
      processedAt: number;
      source: "stripe" | "polar" | "revenuecat";
      userId?: Id<"users">;
      _id: Id<"paymentEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "error"
      | "eventId"
      | "eventType"
      | "payload"
      | "processedAt"
      | "source"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_event_id: ["eventId", "_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  remoteDictationSessions: {
    document: {
      createdAt: number;
      lastActiveAt: number;
      name: string;
      pendingText?: string;
      pendingTextAt?: number;
      seq: number;
      sessionId: string;
      status: "idle" | "pending";
      userId: Id<"users">;
      _id: Id<"remoteDictationSessions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "lastActiveAt"
      | "name"
      | "pendingText"
      | "pendingTextAt"
      | "seq"
      | "sessionId"
      | "status"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "lastActiveAt", "_creationTime"];
      by_user_session: ["userId", "sessionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  replacements: {
    document: {
      createdAt: number;
      destination: string;
      source: string;
      userId: Id<"users">;
      _id: Id<"replacements">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "destination"
      | "source"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  settingsDoc: {
    document: {
      data: any;
      updatedAt: number;
      userId: Id<"users">;
      version: number;
      _id: Id<"settingsDoc">;
      _creationTime: number;
    };
    fieldPaths:
      "_creationTime" | "_id" | "data" | "updatedAt" | "userId" | "version";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  snippets: {
    document: {
      createdAt: number;
      expansion: string;
      trigger: string;
      userId: Id<"users">;
      _id: Id<"snippets">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "expansion"
      | "trigger"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sttTranscriptions: {
    document: {
      audioRetained?: boolean;
      audioSizeBytes?: number;
      audioStorageId?: Id<"_storage">;
      createdAt: number;
      durationMs?: number;
      error?: string;
      language?: string;
      mode?: "file" | "live";
      model: string;
      provider: "deepgram" | "assemblyai" | "elevenlabs" | "openai";
      status: "transcribing" | "done" | "error";
      text?: string;
      userId: Id<"users">;
      _id: Id<"sttTranscriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "audioRetained"
      | "audioSizeBytes"
      | "audioStorageId"
      | "createdAt"
      | "durationMs"
      | "error"
      | "language"
      | "mode"
      | "model"
      | "provider"
      | "status"
      | "text"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  transcriptions: {
    document: {
      createdAt: number;
      occurredAt?: number;
      source: "local" | "remote";
      sourceId?: string;
      text: string;
      userId: Id<"users">;
      _id: Id<"transcriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "occurredAt"
      | "source"
      | "sourceId"
      | "text"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "createdAt", "_creationTime"];
      by_user_source_id: ["userId", "sourceId", "_creationTime"];
    };
    searchIndexes: {
      search_text: {
        searchField: "text";
        filterFields: "userId";
      };
    };
    vectorIndexes: {};
  };
  userApiKeys: {
    document: {
      ciphertext: string;
      createdAt: number;
      iv: string;
      lastTestError?: string;
      lastTestOk?: boolean;
      lastTestedAt?: number;
      provider: "openai" | "anthropic" | "google";
      userId: Id<"users">;
      _id: Id<"userApiKeys">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "ciphertext"
      | "createdAt"
      | "iv"
      | "lastTestedAt"
      | "lastTestError"
      | "lastTestOk"
      | "provider"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_provider: ["userId", "provider", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  userMockMode: {
    document: {
      userId: Id<"users">;
      _id: Id<"userMockMode">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      email?: string;
      emailVerificationTime?: number;
      image?: string;
      isAnonymous?: boolean;
      name?: string;
      phone?: string;
      phoneVerificationTime?: number;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "email"
      | "emailVerificationTime"
      | "image"
      | "isAnonymous"
      | "name"
      | "phone"
      | "phoneVerificationTime";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      email: ["email", "_creationTime"];
      phone: ["phone", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  userSubscriptions: {
    document: {
      canceledAt?: number;
      expiresAt?: number;
      lastEventAt?: number;
      lastSyncedAt: number;
      lastWebhookEvent?: string;
      permanent?: boolean;
      revenueCatAppUserId?: string;
      revenueCatEntitlement?: string;
      source: "stripe" | "polar" | "revenuecat" | "manual";
      status:
        "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      tier: "free" | "pro" | "ultra";
      userId: Id<"users">;
      _id: Id<"userSubscriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "canceledAt"
      | "expiresAt"
      | "lastEventAt"
      | "lastSyncedAt"
      | "lastWebhookEvent"
      | "permanent"
      | "revenueCatAppUserId"
      | "revenueCatEntitlement"
      | "source"
      | "status"
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "tier"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_revenuecat_app_user: ["revenueCatAppUserId", "_creationTime"];
      by_stripe_customer: ["stripeCustomerId", "_creationTime"];
      by_user: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  waitlist: {
    document: {
      createdAt: number;
      email: string;
      referralCode: string;
      referralCount: number;
      referredBy?: string;
      _id: Id<"waitlist">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "email"
      | "referralCode"
      | "referralCount"
      | "referredBy";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_code: ["referralCode", "_creationTime"];
      by_email: ["email", "_creationTime"];
      by_referred_by: ["referredBy", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
