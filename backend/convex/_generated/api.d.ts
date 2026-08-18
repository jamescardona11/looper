/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  accountData: {
    deleteMyAccount: FunctionReference<"mutation", "public", {}, any>;
    exportMyData: FunctionReference<"query", "public", {}, any>;
  };
  admin: {
    demoteFromAdmin: FunctionReference<
      "mutation",
      "public",
      { userId: Id<"users"> },
      any
    >;
    getActiveUserCount: FunctionReference<"query", "public", {}, any>;
    getSubscriptionStats: FunctionReference<"query", "public", {}, any>;
    getUsageByUser: FunctionReference<
      "query",
      "public",
      { limit?: number; sinceMs?: number },
      Array<{
        email: string | null;
        estimatedCostUsd: number;
        messages: number;
        name: string | null;
        totalTokens: number;
        userId: string;
      }>
    >;
    getUsageStats: FunctionReference<
      "query",
      "public",
      { sinceMs?: number },
      any
    >;
    getUserCount: FunctionReference<"query", "public", {}, any>;
    impersonateUser: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    isAdmin: FunctionReference<"query", "public", {}, any>;
    listUsers: FunctionReference<"query", "public", {}, any>;
    promoteToAdmin: FunctionReference<
      "mutation",
      "public",
      { userId: Id<"users"> },
      any
    >;
  };
  agent: {
    credits: {
      balance: FunctionReference<"query", "public", {}, any>;
    };
    messages: {
      addUserMessage: FunctionReference<
        "mutation",
        "public",
        {
          content: string;
          meetingId?: string;
          memoryScope?: "all" | "notes" | "dictations" | "meetings";
          threadId: Id<"agentThreads">;
        },
        any
      >;
      cancelGeneration: FunctionReference<
        "mutation",
        "public",
        { threadId: Id<"agentThreads"> },
        any
      >;
      editUserMessage: FunctionReference<
        "mutation",
        "public",
        { content: string; messageId: Id<"agentMessages"> },
        any
      >;
      list: FunctionReference<
        "query",
        "public",
        { threadId: Id<"agentThreads"> },
        any
      >;
      rateMessage: FunctionReference<
        "mutation",
        "public",
        { messageId: Id<"agentMessages">; rating: "up" | "down" },
        any
      >;
      regenerateLast: FunctionReference<
        "mutation",
        "public",
        { threadId: Id<"agentThreads"> },
        any
      >;
    };
    threads: {
      archiveThread: FunctionReference<
        "mutation",
        "public",
        { threadId: Id<"agentThreads"> },
        any
      >;
      createThread: FunctionReference<
        "mutation",
        "public",
        { title?: string },
        any
      >;
      deleteThread: FunctionReference<
        "mutation",
        "public",
        { threadId: Id<"agentThreads"> },
        any
      >;
      latestThreadPreview: FunctionReference<"query", "public", {}, any>;
      listThreads: FunctionReference<
        "query",
        "public",
        { archived?: boolean; limit?: number },
        any
      >;
      pruneEmptyThreads: FunctionReference<
        "mutation",
        "public",
        { keepThreadId?: Id<"agentThreads"> },
        any
      >;
      renameThread: FunctionReference<
        "mutation",
        "public",
        { threadId: Id<"agentThreads">; title: string },
        any
      >;
    };
    usage: {
      dailyUsage: FunctionReference<"query", "public", { days?: number }, any>;
      monthlyUsage: FunctionReference<"query", "public", {}, any>;
      todayUsage: FunctionReference<"query", "public", {}, any>;
      userUsageThisMonth: FunctionReference<"query", "public", {}, any>;
    };
  };
  analytics: {
    trackEvent: FunctionReference<
      "mutation",
      "public",
      { event: string; properties?: any },
      any
    >;
  };
  auth: {
    isAuthenticated: FunctionReference<"query", "public", {}, any>;
    signIn: FunctionReference<
      "action",
      "public",
      {
        calledBy?: string;
        params?: any;
        provider?: string;
        refreshToken?: string;
        verifier?: string;
      },
      any
    >;
    signOut: FunctionReference<"action", "public", {}, any>;
  };
  dictation: {
    dictionary: {
      add: FunctionReference<"mutation", "public", { term: string }, any>;
      list: FunctionReference<"query", "public", {}, any>;
      remove: FunctionReference<
        "mutation",
        "public",
        { id: Id<"dictionaryEntries"> },
        any
      >;
    };
    remote: {
      consumeDictation: FunctionReference<
        "mutation",
        "public",
        { seq: number; sessionId: string },
        any
      >;
      endSession: FunctionReference<
        "mutation",
        "public",
        { sessionId: string },
        any
      >;
      getPendingDictation: FunctionReference<
        "query",
        "public",
        { sessionId: string },
        any
      >;
      listActiveSessions: FunctionReference<"query", "public", {}, any>;
      registerSession: FunctionReference<
        "mutation",
        "public",
        { name: string; sessionId: string },
        any
      >;
      sendDictation: FunctionReference<
        "mutation",
        "public",
        { sessionId: string; text: string },
        any
      >;
    };
    replacements: {
      add: FunctionReference<
        "mutation",
        "public",
        { destination: string; source: string },
        any
      >;
      list: FunctionReference<"query", "public", {}, any>;
      remove: FunctionReference<
        "mutation",
        "public",
        { id: Id<"replacements"> },
        any
      >;
    };
    settings: {
      get: FunctionReference<"query", "public", {}, any>;
      update: FunctionReference<"mutation", "public", { data: any }, any>;
    };
    snippets: {
      add: FunctionReference<
        "mutation",
        "public",
        { expansion: string; trigger: string },
        any
      >;
      list: FunctionReference<"query", "public", {}, any>;
      remove: FunctionReference<
        "mutation",
        "public",
        { id: Id<"snippets"> },
        any
      >;
    };
    transcriptions: {
      list: FunctionReference<"query", "public", { limit?: number }, any>;
      record: FunctionReference<
        "mutation",
        "public",
        {
          occurredAt?: number;
          source: "local" | "remote";
          sourceId?: string;
          text: string;
        },
        any
      >;
      remove: FunctionReference<
        "mutation",
        "public",
        { id: Id<"transcriptions"> },
        any
      >;
    };
  };
  feedback: {
    feedback: {
      listForAdmin: FunctionReference<
        "query",
        "public",
        { limit?: number },
        any
      >;
      submit: FunctionReference<
        "mutation",
        "public",
        {
          kind: "bug" | "idea" | "praise" | "other";
          message: string;
          path?: string;
          rating?: number;
        },
        any
      >;
    };
  };
  health: {
    status: FunctionReference<"query", "public", {}, any>;
  };
  meetings: {
    sessions: {
      addContext: FunctionReference<
        "mutation",
        "public",
        {
          content: string;
          kind: "text" | "document" | "image" | "link" | "note";
          meetingId: string;
          sourceUrl?: string;
          title: string;
        },
        any
      >;
      appendTranscript: FunctionReference<
        "mutation",
        "public",
        {
          meetingId: string;
          sequence: number;
          speaker?: string;
          status: "partial" | "final";
          text: string;
          timestampMs: number;
        },
        any
      >;
      askMeeting: FunctionReference<
        "query",
        "public",
        { meetingId: string; question: string },
        any
      >;
      claimConfirmedMarkdownOutput: FunctionReference<
        "mutation",
        "public",
        { claimId: string },
        any
      >;
      completeMarkdownOutputDelivery: FunctionReference<
        "mutation",
        "public",
        {
          claimId: string;
          delivered: boolean;
          outputId: Id<"meetingOutputRequests">;
        },
        any
      >;
      confirmMarkdownOutput: FunctionReference<
        "mutation",
        "public",
        { approved: boolean; outputId: Id<"meetingOutputRequests"> },
        any
      >;
      getMeetingBrief: FunctionReference<
        "query",
        "public",
        { meetingId: string },
        any
      >;
      getSession: FunctionReference<
        "query",
        "public",
        { meetingId: string },
        any
      >;
      getTranscriptSince: FunctionReference<
        "query",
        "public",
        { afterSequence: number; limit?: number; meetingId: string },
        any
      >;
      listActiveSessions: FunctionReference<"query", "public", {}, any>;
      listConnectedDevices: FunctionReference<
        "query",
        "public",
        { meetingId: string },
        any
      >;
      listContexts: FunctionReference<
        "query",
        "public",
        { meetingId: string },
        any
      >;
      listSessions: FunctionReference<
        "query",
        "public",
        { limit?: number },
        any
      >;
      prepareMarkdownOutput: FunctionReference<
        "mutation",
        "public",
        { meetingId: string; preview: string },
        any
      >;
      registerCompanionDevice: FunctionReference<
        "mutation",
        "public",
        { deviceId: string; meetingId: string; name: string },
        any
      >;
      searchMeetingMemory: FunctionReference<
        "query",
        "public",
        { limit?: number; query: string },
        any
      >;
      setSessionState: FunctionReference<
        "mutation",
        "public",
        {
          meetingId: string;
          sharingEnabled: boolean;
          state: "active" | "paused" | "ended";
        },
        any
      >;
      startSession: FunctionReference<
        "mutation",
        "public",
        { meetingId: string; sharingEnabled: boolean; title: string },
        any
      >;
    };
  };
  mock: {
    getMockMode: FunctionReference<"query", "public", {}, any>;
    setMockMode: FunctionReference<
      "mutation",
      "public",
      { enabled: boolean },
      any
    >;
  };
  notes: {
    notes: {
      create: FunctionReference<
        "mutation",
        "public",
        { body: string; kind?: "note" | "dictation"; title: string },
        any
      >;
      list: FunctionReference<"query", "public", {}, any>;
      remove: FunctionReference<"mutation", "public", { id: Id<"notes"> }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        { body: string; id: Id<"notes">; title: string },
        any
      >;
      upsertFromDevice: FunctionReference<
        "mutation",
        "public",
        {
          body: string;
          createdAt: number;
          kind: "note" | "dictation";
          sourceId: string;
          title: string;
          updatedAt: number;
        },
        any
      >;
    };
  };
  onboarding: {
    onboarding: {
      completeStep: FunctionReference<
        "mutation",
        "public",
        { data?: string; step: string },
        any
      >;
      myState: FunctionReference<"query", "public", {}, any>;
      skipAll: FunctionReference<"mutation", "public", {}, any>;
      skipStep: FunctionReference<"mutation", "public", { step: string }, any>;
    };
  };
  payments: {
    credits: {
      myCredits: FunctionReference<"query", "public", {}, any>;
    };
    polar: {
      createCheckout: FunctionReference<
        "action",
        "public",
        { productKey: string; successUrl: string },
        any
      >;
      customerPortal: FunctionReference<
        "action",
        "public",
        { returnUrl?: string },
        any
      >;
      listAllSubscriptions: FunctionReference<"query", "public", {}, any>;
      listProducts: FunctionReference<"query", "public", {}, any>;
      myPolarSubscription: FunctionReference<"query", "public", {}, any>;
    };
    revenueCat: {
      syncRevenueCatPurchase: FunctionReference<
        "action",
        "public",
        { appUserId: string },
        any
      >;
    };
    stripe: {
      createCheckoutSession: FunctionReference<
        "action",
        "public",
        {
          cancelUrl: string;
          interval: "monthly" | "yearly";
          successUrl: string;
          tier: "pro" | "ultra";
        },
        any
      >;
      createOneTimeCheckout: FunctionReference<
        "action",
        "public",
        {
          allowCrypto?: boolean;
          cancelUrl: string;
          pack: "credits_100" | "credits_500" | "lifetime";
          successUrl: string;
        },
        any
      >;
      createPortalSession: FunctionReference<
        "action",
        "public",
        { returnUrl: string },
        any
      >;
    };
    stripeCustomerForUser: FunctionReference<"query", "public", {}, any>;
    subscription: {
      grantTierManually: FunctionReference<
        "mutation",
        "public",
        {
          expiresAt?: number;
          tier: "free" | "pro" | "ultra";
          userId: Id<"users">;
        },
        any
      >;
      mySubscription: FunctionReference<"query", "public", {}, any>;
    };
  };
  stt: {
    stream: {
      createStreamSession: FunctionReference<
        "action",
        "public",
        { provider: "deepgram" | "assemblyai" | "elevenlabs" | "openai" },
        any
      >;
      saveStreamTranscript: FunctionReference<
        "mutation",
        "public",
        {
          durationMs?: number;
          language?: string;
          provider: "deepgram" | "assemblyai" | "elevenlabs" | "openai";
          text: string;
        },
        any
      >;
    };
    transcribe: {
      configuration: FunctionReference<"query", "public", {}, any>;
      generateUploadUrl: FunctionReference<"mutation", "public", {}, any>;
      list: FunctionReference<"query", "public", { limit?: number }, any>;
      transcribe: FunctionReference<
        "action",
        "public",
        {
          audioStorageId: Id<"_storage">;
          contentType?: string;
          durationMs?: number;
          language?: string;
          model?: string;
          provider: "deepgram" | "assemblyai" | "elevenlabs" | "openai";
          retainAudio?: boolean;
        },
        any
      >;
    };
    usage: {
      current: FunctionReference<"query", "public", {}, any>;
    };
  };
  upgrade: {
    claimAnonymousData: FunctionReference<
      "mutation",
      "public",
      { anonymousUserId: Id<"users"> },
      any
    >;
    viewer: FunctionReference<"query", "public", {}, any>;
  };
  upload: {
    generateUploadUrl: FunctionReference<"mutation", "public", {}, any>;
  };
  userKeys: {
    keys: {
      clearKey: FunctionReference<
        "mutation",
        "public",
        { provider: "openai" | "anthropic" | "google" },
        any
      >;
      saveKey: FunctionReference<
        "action",
        "public",
        { plaintext: string; provider: "openai" | "anthropic" | "google" },
        any
      >;
      status: FunctionReference<"query", "public", {}, any>;
      testKey: FunctionReference<
        "action",
        "public",
        { provider: "openai" | "anthropic" | "google" },
        any
      >;
    };
  };
  users: {
    me: FunctionReference<"query", "public", {}, any>;
  };
  waitlist: {
    waitlist: {
      count: FunctionReference<"query", "public", {}, any>;
      join: FunctionReference<
        "mutation",
        "public",
        { email: string; referredBy?: string },
        any
      >;
      statusByCode: FunctionReference<
        "query",
        "public",
        { referralCode: string },
        any
      >;
    };
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  accountData: {
    _purgeUserData: FunctionReference<
      "mutation",
      "internal",
      { userId: Id<"users"> },
      any
    >;
  };
  agent: {
    credits: {
      assertCredits: FunctionReference<
        "mutation",
        "internal",
        {
          cost: number;
          idempotencyKey: string;
          provider?: string;
          reason: string;
          userId: Id<"users">;
        },
        any
      >;
      assertWithinLimit: FunctionReference<
        "mutation",
        "internal",
        { consumeCreditKey?: string; userId: Id<"users"> },
        any
      >;
    };
    messages: {
      appendAssistantChunk: FunctionReference<
        "mutation",
        "internal",
        { content: string; messageId: Id<"agentMessages"> },
        any
      >;
      createAssistantPlaceholder: FunctionReference<
        "mutation",
        "internal",
        { threadId: Id<"agentThreads">; userId: Id<"users"> },
        any
      >;
      finalizeAssistantMessage: FunctionReference<
        "mutation",
        "internal",
        {
          finalContent?: string;
          messageId: Id<"agentMessages">;
          reasoning?: string;
          status: "done" | "error";
          toolCalls?: string;
        },
        any
      >;
    };
    reply: {
      _loadHistoryForReply: FunctionReference<
        "query",
        "internal",
        { threadId: Id<"agentThreads"> },
        any
      >;
      replyToThread: FunctionReference<
        "action",
        "internal",
        { threadId: Id<"agentThreads">; userId: Id<"users"> },
        any
      >;
    };
    tools: {
      _searchDictationHistory: FunctionReference<
        "query",
        "internal",
        { limit?: number; query: string; userId: Id<"users"> },
        any
      >;
      _searchLooperMemory: FunctionReference<
        "query",
        "internal",
        {
          kinds?: Array<"note" | "dictation" | "meeting">;
          limit?: number;
          meetingId?: string;
          query: string;
          userId: Id<"users">;
        },
        any
      >;
    };
    usage: {
      countSince: FunctionReference<
        "query",
        "internal",
        { sinceMs: number; userId: Id<"users"> },
        any
      >;
      logUsage: FunctionReference<
        "mutation",
        "internal",
        {
          completionTokens: number;
          durationMs: number;
          model: string;
          promptTokens: number;
          provider: "openai" | "anthropic" | "google";
          threadId: Id<"agentThreads">;
          toolCalls: number;
          userId: Id<"users">;
        },
        any
      >;
    };
  };
  auth: {
    store: FunctionReference<
      "mutation",
      "internal",
      {
        args:
          | {
              generateTokens: boolean;
              sessionId?: Id<"authSessions">;
              type: "signIn";
              userId: Id<"users">;
            }
          | { type: "signOut" }
          | { refreshToken: string; type: "refreshSession" }
          | {
              allowExtraProviders: boolean;
              generateTokens: boolean;
              params: any;
              provider?: string;
              type: "verifyCodeAndSignIn";
              verifier?: string;
            }
          | { type: "verifier" }
          | { signature: string; type: "verifierSignature"; verifier: string }
          | {
              profile: any;
              provider: string;
              providerAccountId: string;
              signature: string;
              type: "userOAuth";
            }
          | {
              accountId?: Id<"authAccounts">;
              allowExtraProviders: boolean;
              code: string;
              email?: string;
              expirationTime: number;
              phone?: string;
              provider: string;
              type: "createVerificationCode";
            }
          | {
              account: { id: string; secret?: string };
              profile: any;
              provider: string;
              shouldLinkViaEmail?: boolean;
              shouldLinkViaPhone?: boolean;
              type: "createAccountFromCredentials";
            }
          | {
              account: { id: string; secret?: string };
              provider: string;
              type: "retrieveAccountWithCredentials";
            }
          | {
              account: { id: string; secret: string };
              provider: string;
              type: "modifyAccount";
            }
          | {
              except?: Array<Id<"authSessions">>;
              type: "invalidateSessions";
              userId: Id<"users">;
            };
      },
      any
    >;
  };
  cronHandlers: {
    archiveStaleThreads: FunctionReference<"mutation", "internal", {}, any>;
    prunePaymentEvents: FunctionReference<"mutation", "internal", {}, any>;
  };
  mock: {
    mockEnabledFor: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
  };
  payments: {
    credits: {
      grantCreditsForPurchase: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          idempotencyKey: string;
          reason?: string;
          type: "grant" | "topup";
          userId: Id<"users">;
        },
        any
      >;
      grantSubscriptionCredits: FunctionReference<
        "mutation",
        "internal",
        {
          credits: number;
          idempotencyKey: string;
          reason?: string;
          revenueCatAppUserId?: string;
          stripeCustomerId?: string;
          userId?: string;
        },
        any
      >;
    };
    emailForUser: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    findEventById: FunctionReference<
      "query",
      "internal",
      { eventId: string },
      any
    >;
    getSubscriptionByUser: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    logPaymentEvent: FunctionReference<
      "mutation",
      "internal",
      {
        eventId: string;
        eventType: string;
        payload: string;
        source: "stripe" | "polar" | "revenuecat";
        userId?: Id<"users">;
      },
      any
    >;
    updateByRevenueCatAppUser: FunctionReference<
      "mutation",
      "internal",
      {
        entitlement?: string;
        eventAtMs?: number;
        expiresAt?: number;
        revenueCatAppUserId: string;
        status:
          "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
        tier: "free" | "pro" | "ultra";
      },
      any
    >;
    updateByStripeCustomer: FunctionReference<
      "mutation",
      "internal",
      {
        eventAtMs?: number;
        expiresAt?: number;
        status:
          "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
        stripeCustomerId: string;
        stripeSubscriptionId?: string;
        tier: "free" | "pro" | "ultra";
      },
      any
    >;
    upsertPolarSubscription: FunctionReference<
      "mutation",
      "internal",
      {
        expiresAt?: number;
        status:
          "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
        tier: "free" | "pro" | "ultra";
        userId: string;
      },
      any
    >;
    upsertRevenueCatSubscription: FunctionReference<
      "mutation",
      "internal",
      {
        activeEntitlements: Array<string>;
        appUserId: string;
        eventAtMs?: number;
        rawSubscriber: string;
        userId: Id<"users">;
      },
      any
    >;
    upsertStripeSubscription: FunctionReference<
      "mutation",
      "internal",
      {
        eventAtMs?: number;
        expiresAt?: number;
        permanent?: boolean;
        status:
          "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        tier: "free" | "pro" | "ultra";
        userId: Id<"users">;
      },
      any
    >;
  };
  stt: {
    transcribe: {
      createPlaceholder: FunctionReference<
        "mutation",
        "internal",
        {
          audioRetained: boolean;
          audioSizeBytes?: number;
          audioStorageId: Id<"_storage">;
          durationMs?: number;
          model: string;
          provider: "deepgram" | "assemblyai" | "elevenlabs" | "openai";
          userId: Id<"users">;
        },
        any
      >;
      deleteAudio: FunctionReference<
        "mutation",
        "internal",
        { audioStorageId: Id<"_storage"> },
        any
      >;
      finalize: FunctionReference<
        "mutation",
        "internal",
        {
          durationMs?: number;
          error?: string;
          language?: string;
          status: "done" | "error";
          text?: string;
          transcriptionId: Id<"sttTranscriptions">;
        },
        any
      >;
      getAudioMetadata: FunctionReference<
        "query",
        "internal",
        { audioStorageId: Id<"_storage"> },
        any
      >;
    };
  };
  userKeys: {
    keys: {
      _getEncrypted: FunctionReference<
        "query",
        "internal",
        { provider: "openai" | "anthropic" | "google"; userId: Id<"users"> },
        any
      >;
      _markTestResult: FunctionReference<
        "mutation",
        "internal",
        {
          error: string | null;
          ok: boolean;
          provider: "openai" | "anthropic" | "google";
          userId: Id<"users">;
        },
        any
      >;
      _resolvePlaintextForUser: FunctionReference<
        "action",
        "internal",
        { provider: "openai" | "anthropic" | "google"; userId: Id<"users"> },
        any
      >;
      _upsertEncrypted: FunctionReference<
        "mutation",
        "internal",
        {
          ciphertext: string;
          iv: string;
          provider: "openai" | "anthropic" | "google";
          userId: Id<"users">;
        },
        any
      >;
    };
  };
};

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
  posthog: import("@posthog/convex/_generated/component.js").ComponentApi<"posthog">;
};
