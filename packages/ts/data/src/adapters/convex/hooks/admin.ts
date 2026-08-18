// Convex adapter — admin hooks plus optional product-pack operations.
//
// Implements the admin domain surface: useAdmin, useIsAdmin,
// useAdminUserDetails and useAdminActions. Optional modules extend the same
// surface through projection blocks and typed API references.
//
// Boundary rules honored:
//   - useQuery/useMutation are called UNCONDITIONALLY. The one lazy read
//     (useAdminUserDetails) passes the Convex "skip" sentinel when disabled —
//     never `enabled ? useQuery(...) : null`.
//   - Convex's loading sentinel is `undefined`. Admin hooks deliberately preserve
//     `undefined`-while-loading per field (the dashboard + nav gate on it), so we
//     do NOT default to [] here — that is correct for this surface.
//   - Id<> brands are stripped at the boundary: every userId in a signature is a
//     plain string; the `as Id<"users">` casts live INSIDE this adapter only.

// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import { api } from "@looper/backend/convex/_generated/api";
import type { Id } from "@looper/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type {
  AdminUsageByUser,
  AdminUsageStats,
  AdminUser,
  AdminUserDetails,
  MockMode,
  SubscriptionStats,
  Tier,
} from "../../../types";
import { SKIP } from "../query-control";

// Admin dashboard reads. Every query is called unconditionally; each field keeps
// Convex's `undefined`-while-loading semantics (the route + nav rely on it). The
// aggregate `isLoading` is true until the core fields have resolved.
export function useAdmin(): {
  isAdmin: boolean | undefined;
  userCount: number | undefined;
  activeCount: number | undefined;
  subStats: SubscriptionStats | undefined;
  users: AdminUser[] | undefined;
  usageStats: AdminUsageStats | undefined;
  usageByUser: AdminUsageByUser[] | undefined;
  isLoading: boolean;
} {
  const isAdmin = useQuery(api.admin.isAdmin);
  const userCount = useQuery(api.admin.getUserCount);
  const activeCount = useQuery(api.admin.getActiveUserCount);
  const subStats = useQuery(api.admin.getSubscriptionStats);
  const users = useQuery(api.admin.listUsers);
  const usageStats = useQuery(api.admin.getUsageStats, {});
  const usageByUser = useQuery(api.admin.getUsageByUser, {});

  return {
    isAdmin,
    userCount,
    activeCount,
    subStats,
    users,
    usageStats,
    usageByUser,
    isLoading: isAdmin === undefined,
  };
}

// Standalone admin nav gate (__root AppNav). Split from useAdmin so the nav does
// not subscribe to the whole dashboard query set. `undefined` = still loading.
export function useIsAdmin(): boolean | undefined {
  return useQuery(api.admin.isAdmin);
}

// On-demand per-row "view details" (impersonateUser returns profile + sub, NOT a
// token). Lazy: passes "skip" until `enabled` is true AND a userId is present, so
// the subscription only opens when the row is expanded. userId crosses the
// boundary as a plain string; cast to Id<"users"> here.
export function useAdminUserDetails(
  userId: string | null,
  enabled: boolean,
): AdminUserDetails | undefined {
  return useQuery(
    api.admin.impersonateUser,
    enabled && userId ? { userId: userId as Id<"users"> } : SKIP,
  );
}

// Per-row admin mutations. userId arrives as a plain string and is cast to
// Id<"users"> inside the adapter. No optimistic update — listUsers/details
// reactivity reflects the change. grantTierManually is the only call under
// api.payments.subscription.* in the admin surface.
export function useAdminActions(): {
  grantTier: (userId: string, tier: Tier) => Promise<void>;
  promote: (userId: string) => Promise<void>;
  demote: (userId: string) => Promise<void>;
} {
  const grantTierMutation = useMutation(api.payments.subscription.grantTierManually);
  const promoteMutation = useMutation(api.admin.promoteToAdmin);
  const demoteMutation = useMutation(api.admin.demoteFromAdmin);

  const grantTier = useCallback(
    async (userId: string, tier: Tier) => {
      await grantTierMutation({ userId: userId as Id<"users">, tier });
    },
    [grantTierMutation],
  );
  const promote = useCallback(
    async (userId: string) => {
      await promoteMutation({ userId: userId as Id<"users"> });
    },
    [promoteMutation],
  );
  const demote = useCallback(
    async (userId: string) => {
      await demoteMutation({ userId: userId as Id<"users"> });
    },
    [demoteMutation],
  );

  return {
    grantTier,
    promote,
    demote,
  };
}

// Per-user provider-free mode. getMockMode
// is reactive ({ forced, enabled }); setMockMode is fire-and-forget.
export function useMockMode(): {
  mock: MockMode | undefined;
  setMockMode: (enabled: boolean) => Promise<void>;
} {
  const mock = useQuery(api.mock.getMockMode);
  const setMutation = useMutation(api.mock.setMockMode);

  const setMockMode = useCallback(
    async (enabled: boolean) => {
      await setMutation({ enabled });
    },
    [setMutation],
  );

  return { mock, setMockMode };
}
