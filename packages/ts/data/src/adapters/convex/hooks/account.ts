// Convex adapter — account/auth, feedback and waitlist domain hooks.
// Optional account-adjacent modules extend this file through projection blocks.
//
// Each hook below returns the domain types from ../../../types. The
// Convex-specific concerns — Id<> brand stripping, string-ref functions, the
// "skip" sentinel, the undefined→isLoading loading convention, and the one-shot
// query escape hatch — all live INSIDE this adapter. apps/* import the bound hooks
// from the root barrel.

import { api } from "@looper/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type {
  CurrentUser,
  FeedbackInput,
  OnboardingState,
  WaitlistJoinInput,
  WaitlistJoinResult,
  WaitlistStatus,
} from "../../../types";
import { useAuth, useConvexBackend } from "../provider";
import { SKIP } from "../query-control";

// ── auth / account ──────────────────────────────────────────────────────────

// SINGLE home for api.users.me. The ref is `(api as any).users?.me ?? "users:me"`
// (typed-api with a string-ref fallback for pre-codegen portability). useQuery is
// called UNCONDITIONALLY; we pass the SKIP sentinel until the auth lib reports an
// authenticated session — mirroring the call-sites that skip when !isAuthenticated.
// me._id (a branded Id<"users">) is mapped to a plain-string user.id at the boundary.
export function useCurrentUser(): { user: CurrentUser | null; isLoading: boolean } {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : SKIP) as
    | {
        _id: string;
        email?: string | null;
        name?: string | null;
        isAnonymous?: boolean;
      }
    | null
    | undefined;

  // Loading while the auth lib is resolving, or while the query is in flight for
  // an authenticated session. Signed-out → not loading, user null.
  if (!isAuthenticated) {
    return { user: null, isLoading: authLoading };
  }
  if (me === undefined) {
    return { user: null, isLoading: true };
  }
  if (me === null) {
    return { user: null, isLoading: false };
  }
  return {
    user: {
      id: me._id,
      email: me.email ?? null,
      name: me.name ?? null,
      isAnonymous: Boolean(me.isAnonymous),
    },
    isLoading: false,
  };
}

// Anonymous → real account upgrade. STRING-REF functions ("upgrade:viewer" /
// "upgrade:prepareAnonymousUpgrade" / "upgrade:claimAnonymousData" as never) —
// deliberately NOT the typed api object so the file stays portable before codegen
// wires upgrade.ts. Orchestration ORDER is load-bearing: snapshot the anonymous
// userId AND mint the upgrade nonce BEFORE signIn (which rotates the session onto
// the real user — the nonce can only be minted while we still ARE the anonymous
// user), then claim AFTER signIn with that nonce, guarded on isAnonymous.
export function useUpgradeFromAnonymous(): {
  isAnonymous: boolean;
  isReady: boolean;
  upgrade: (formData: FormData) => Promise<void>;
} {
  const { signIn } = useAuth();
  const viewer = useQuery("upgrade:viewer" as never) as
    | {
        userId: string;
        email?: string;
        name?: string;
        isAnonymous: boolean;
      }
    | null
    | undefined;
  const prepare = useMutation("upgrade:prepareAnonymousUpgrade" as never);
  const claim = useMutation("upgrade:claimAnonymousData" as never);

  const upgrade = useCallback(
    async (formData: FormData) => {
      const sourceId = viewer?.isAnonymous ? viewer.userId : null;
      // Minting must not gate the sign-in itself: a backend that predates
      // `prepareAnonymousUpgrade` (or a transient failure) would otherwise leave
      // the anonymous user unable to verify their code at all. Failing to mint
      // degrades to the same outcome as a failed claim — signed in, transfer
      // reported as failed — which is the contract this hook already had.
      let nonce: string | null = null;
      let mintFailure: unknown = null;
      if (sourceId) {
        try {
          nonce = (
            await (
              prepare as unknown as (args: Record<string, never>) => Promise<{ nonce: string }>
            )({})
          ).nonce;
        } catch (cause) {
          mintFailure = cause;
        }
      }
      await signIn("resend-otp", formData);
      if (sourceId && !nonce) {
        throw new Error(
          `Signed in but data transfer failed: ${
            mintFailure instanceof Error ? mintFailure.message : "could not prepare the upgrade"
          }`,
        );
      }
      if (sourceId && nonce) {
        try {
          await (
            claim as unknown as (args: {
              anonymousUserId: string;
              nonce: string;
            }) => Promise<unknown>
          )({
            anonymousUserId: sourceId,
            nonce,
          });
        } catch (cause) {
          // Convex Auth can upgrade the anonymous account in place. In that
          // case source and target are already the same user, so there is no
          // data transfer left to perform.
          if (
            cause instanceof Error &&
            /Source and target users must differ/i.test(cause.message)
          ) {
            return;
          }
          throw new Error(
            `Signed in but data transfer failed: ${
              cause instanceof Error ? cause.message : "unknown"
            }`,
          );
        }
      }
    },
    [viewer, signIn, prepare, claim],
  );

  return {
    isAnonymous: viewer?.isAnonymous ?? false,
    isReady: viewer !== undefined,
    upgrade,
  };
}

// Account data rights. deleteAccount is a reactive mutation; exportMyData is an
// IMPERATIVE one-shot read via the ConvexProvider's query() escape hatch (not a
// reactive subscription). Post-call navigation (redirect / signOut) stays at the
// call-site.
export function useAccountData(): {
  deleteAccount: () => Promise<void>;
  exportMyData: () => Promise<unknown>;
} {
  const { query } = useConvexBackend();
  const deleteMutation = useMutation(api.accountData.deleteMyAccount);

  const deleteAccount = useCallback(async () => {
    await deleteMutation({});
  }, [deleteMutation]);

  const exportMyData = useCallback(() => query(api.accountData.exportMyData, {}), [query]);

  return { deleteAccount, exportMyData };
}

// ── onboarding ────────────────────────────────────────────────────────────────

// Reactive onboarding state + step mutations. complete() JSON.stringify's the
// optional data in-hook before sending (only when defined). Cross-device reactive.
// state left undefined while loading; derived getters default (currentStep null,
// lists [], isComplete false).
export function useOnboarding(): {
  state: OnboardingState | undefined;
  currentStep: string | null;
  completedSteps: string[];
  skippedSteps: string[];
  isComplete: boolean;
  isLoading: boolean;
  complete: (step: string, data?: unknown) => Promise<void>;
  skip: (step: string) => Promise<void>;
  skipAll: () => Promise<void>;
} {
  const state = useQuery(api.onboarding.onboarding.myState) as OnboardingState | null | undefined;
  const completeMutation = useMutation(api.onboarding.onboarding.completeStep);
  const skipMutation = useMutation(api.onboarding.onboarding.skipStep);
  const skipAllMutation = useMutation(api.onboarding.onboarding.skipAll);

  const complete = useCallback(
    async (step: string, data?: unknown) => {
      await completeMutation(data !== undefined ? { step, data: JSON.stringify(data) } : { step });
    },
    [completeMutation],
  );

  const skip = useCallback(
    async (step: string) => {
      await skipMutation({ step });
    },
    [skipMutation],
  );

  const skipAll = useCallback(async () => {
    await skipAllMutation();
  }, [skipAllMutation]);

  return {
    state: state ?? undefined,
    currentStep: state?.currentStep ?? null,
    completedSteps: state?.completedSteps ?? [],
    skippedSteps: state?.skippedSteps ?? [],
    isComplete: state?.isComplete ?? false,
    isLoading: state === undefined,
    complete,
    skip,
    skipAll,
  };
}

// ── feedback ──────────────────────────────────────────────────────────────────

// Submit in-app feedback (bug / idea / praise / other). Works signed-in OR
// anonymous (the backend allows a null userId). Returns the bare submit callback.
export function useFeedback(): (input: FeedbackInput) => Promise<void> {
  const submit = useMutation(api.feedback.feedback.submit);
  return useCallback(
    async (input: FeedbackInput) => {
      await submit(input);
    },
    [submit],
  );
}

// ── waitlist ──────────────────────────────────────────────────────────────────

// Pre-launch waitlist: join (idempotent by email) + a live total count + a
// per-code status. statusByCode is skip-gated on a nullable referralCode (the
// `enabled/disabled` form). Reactive position/referralCount.
export function useWaitlist(referralCode: string | null): {
  join: (input: WaitlistJoinInput) => Promise<WaitlistJoinResult>;
  total: number | undefined;
  status: WaitlistStatus | undefined;
  isLoading: boolean;
} {
  const joinMutation = useMutation(api.waitlist.waitlist.join);
  const total = useQuery(api.waitlist.waitlist.count, {});
  const status = useQuery(
    api.waitlist.waitlist.statusByCode,
    referralCode ? { referralCode } : SKIP,
  ) as WaitlistStatus | null | undefined;

  const join = useCallback(
    (input: WaitlistJoinInput) =>
      joinMutation({
        email: input.email,
        ...(input.referredBy ? { referredBy: input.referredBy } : {}),
      }) as Promise<WaitlistJoinResult>,
    [joinMutation],
  );

  return {
    join,
    total,
    status: status ?? undefined,
    isLoading: referralCode !== null && status === undefined,
  };
}
