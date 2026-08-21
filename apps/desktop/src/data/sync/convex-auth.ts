// Data boundary for Convex Auth on desktop (F3, see MEGAPLAN). Started as a
// MINIMAL anonymous-only session (F3-lite) so remote-dictation.ts (the
// mobile -> desktop paste channel) could call the authenticated
// dictation/remote.ts functions; now generalized to also support real
// sign-in (email OTP) and an observable auth state, so a visible "Sign in"
// UI (see ../features/sync) and the dictionary/settings/history sync worker
// (../data/sync-engine.ts) can react to who's signed in.
//
// Reimplements the slice of the `@convex-dev/auth` wire protocol needed for
// the anonymous + email-OTP providers: call the `auth:signIn` action
// with `{provider, params}`, persist the returned `{token, refreshToken}`
// pair, and rotate via `{refreshToken}` when asked. Provider ids match
// backend/convex/auth.ts exactly: `"anonymous"` and `"resend-otp"` (NOT
// `"email"` - see that file's comment on why).
//
// Unlike the mobile client, this module drives `auth:signIn` over the same
// WebSocket `ConvexClient` (via `client.action`) instead of a raw HTTP
// transport - there is no pre-auth chicken-and-egg problem here because
// Convex actions never require an existing session, and `ConvexClient.setAuth`
// is exactly the hook meant for wiring a token fetcher like this one.
//
// Multi-window note: each Tauri window (`main`, `settings`) is a separate JS
// realm, so this module's state (and any `ConvexClient` built from it) is
// NOT shared across windows - only `localStorage` is. `ensureAnonymousSession`
// therefore also listens for cross-window `storage` events on the token key,
// so a sign-in performed in the `settings` window (see ../features/sync) is
// picked up by the `main` window's session (e.g. remote-dictation.ts, the
// sync engine) without a restart.
import { api } from "@looper/backend/convex/_generated/api";
import type { Id } from "@looper/backend/dataModel";
import { invoke } from "@tauri-apps/api/core";
import { ConvexClient } from "convex/browser";

const TOKEN_STORAGE_KEY = "looper.convexAuth.tokens";

type StoredTokens = { token: string; refreshToken: string };
type AccessTokenListener = (token: string | null) => void;
const accessTokenListeners = new Set<AccessTokenListener>();

// ── Observable auth state ───────────────────────────────────────────────
//
// These four states let the Sync tab distinguish loading, signed-out,
// anonymous and identified sessions.

export type AuthStatus =
  "loading" | "unauthenticated" | "anonymous" | "authenticated";

export type AuthState = {
  status: AuthStatus;
  userId?: string;
  email?: string;
};

export type Viewer = {
  userId: string;
  email?: string;
  name?: string;
  isAnonymous: boolean;
};

/** Classifies `upgrade:viewer`'s result. Pure - see convex-auth.test.ts. */
export function viewerFromResult(result: unknown): Viewer | null {
  const value = result as
    | {
        userId?: unknown;
        email?: unknown;
        name?: unknown;
        isAnonymous?: unknown;
      }
    | null
    | undefined;
  if (!value || typeof value.userId !== "string") return null;
  return {
    userId: value.userId,
    email: typeof value.email === "string" ? value.email : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
    isAnonymous: Boolean(value.isAnonymous),
  };
}

/** Derives the four-way `AuthState` from a viewer. Pure - see convex-auth.test.ts. */
export function authStateFromViewer(viewer: Viewer | null): AuthState {
  if (!viewer) return { status: "unauthenticated" };
  if (viewer.isAnonymous) return { status: "anonymous", userId: viewer.userId };
  return {
    status: "authenticated",
    userId: viewer.userId,
    email: viewer.email,
  };
}

function readTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof (parsed as StoredTokens).token === "string" &&
      typeof (parsed as StoredTokens).refreshToken === "string"
    ) {
      return parsed as StoredTokens;
    }
  } catch {
    // Corrupt/foreign value - treat as no stored session.
  }
  return null;
}

function writeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  accessTokenListeners.forEach((listener) => listener(tokens.token));
}

export function currentAccessToken(): string | null {
  return readTokens()?.token ?? null;
}

export async function setCloudAuthToken(token: string | null): Promise<void> {
  await invoke("set_cloud_auth_token", { token });
}

export function subscribeAccessToken(
  listener: AccessTokenListener,
): () => void {
  accessTokenListeners.add(listener);
  listener(currentAccessToken());
  return () => accessTokenListeners.delete(listener);
}

function tokensFromSignInResult(result: unknown): StoredTokens | null {
  const tokens = (result as { tokens?: unknown } | null | undefined)?.tokens as
    { token?: unknown; refreshToken?: unknown } | undefined;
  if (
    typeof tokens?.token === "string" &&
    typeof tokens.refreshToken === "string"
  ) {
    return { token: tokens.token, refreshToken: tokens.refreshToken };
  }
  return null;
}

async function signInAnonymous(
  client: ConvexClient,
): Promise<StoredTokens | null> {
  const result = await client.action(api.auth.signIn, {
    provider: "anonymous",
    params: {},
  });
  return tokensFromSignInResult(result);
}

async function refreshSession(
  client: ConvexClient,
  refreshToken: string,
): Promise<StoredTokens | null> {
  const result = await client.action(api.auth.signIn, { refreshToken });
  return tokensFromSignInResult(result);
}

/**
 * The `setAuth` token fetcher: returns the stored token as-is unless a
 * refresh was forced, in which case it rotates via the stored refresh token,
 * minting a brand-new anonymous session as the last resort (e.g. first run,
 * or after `signOutSession` clears tokens). Shared by `ensureAnonymousSession`
 * and `reauthenticate` so sign-in/sign-out only need to re-trigger the same
 * logic, not duplicate it.
 */
function fetchTokenFor(
  client: ConvexClient,
): (opts: { forceRefreshToken: boolean }) => Promise<string | null> {
  return async ({ forceRefreshToken }) => {
    const stored = readTokens();
    if (stored && !forceRefreshToken) return stored.token;

    if (stored?.refreshToken) {
      try {
        const refreshed = await refreshSession(client, stored.refreshToken);
        if (refreshed) {
          writeTokens(refreshed);
          return refreshed.token;
        }
      } catch (err) {
        console.warn("[convex-auth] session refresh failed", err);
      }
    }

    try {
      const minted = await signInAnonymous(client);
      if (minted) {
        writeTokens(minted);
        return minted.token;
      }
    } catch (err) {
      console.warn("[convex-auth] anonymous sign-in failed", err);
    }
    return null;
  };
}

/** Re-runs `client.setAuth` with a fresh fetcher closure - forces Convex to
 * re-fetch (and thus pick up) whatever is currently in `localStorage`. Used
 * right after `writeTokens`/`localStorage.removeItem` calls in
 * `verifyEmailOtp`/`signOutSession` so the change takes effect immediately
 * instead of waiting for the client's own refresh timer. */
function reauthenticate(client: ConvexClient): void {
  client.setAuth(fetchTokenFor(client));
}

/**
 * Wires an anonymous Convex Auth session onto `client` via `setAuth`: mints a
 * new anonymous user on first use (or rotates the stored refresh token) and
 * persists the token pair in `localStorage` so it survives app restarts.
 * Also re-authenticates whenever another window changes the stored tokens
 * (sign-in/out performed from the Sync tab in the `settings` window) so this
 * client's identity stays in lockstep without a restart.
 *
 * Failures are caught and logged, resolving to a signed-out client rather
 * than throwing - matches remote-dictation.ts's existing fail-closed
 * behavior when auth isn't available.
 */
export function ensureAnonymousSession(client: ConvexClient): void {
  reauthenticate(client);

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === TOKEN_STORAGE_KEY) reauthenticate(client);
    });
  }
}

/** Creates a fresh `ConvexClient` for `VITE_CONVEX_URL`, or `null` if it isn't
 * configured (fail-closed, matching remote-dictation.ts). One client per
 * window - Tauri windows are separate JS realms and can't share one. */
export function createConvexClient(): ConvexClient | null {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) return null;
  return new ConvexClient(url);
}

/**
 * FLOW 2 step A - email OTP request.
 * Emails a code via the `resend-otp` provider; the server returns no tokens
 * for this leg.
 */
export async function requestEmailOtp(
  client: ConvexClient,
  email: string,
): Promise<void> {
  await client.action(api.auth.signIn, {
    provider: "resend-otp",
    params: { email },
  });
}

/**
 * FLOW 2 step B - email OTP verify. On success, persists the new tokens and
 * forces this client to re-authenticate as the newly signed-in user.
 *
 * If the session was anonymous right before this call, also claims that
 * anonymous user's data (dictionary/replacements/etc, per
 * backend/convex/userScopedTables.ts) onto the new account. The claim is
 * authorized by a nonce minted BEFORE the sign-in, while the session is still
 * the anonymous one - that is what proves we owned it.
 */
export async function verifyEmailOtp(
  client: ConvexClient,
  email: string,
  code: string,
): Promise<void> {
  let anonymousUserId: string | null = null;
  try {
    const priorViewer = viewerFromResult(
      await client.query(api.upgrade.viewer, {}),
    );
    anonymousUserId = priorViewer?.isAnonymous ? priorViewer.userId : null;
  } catch (err) {
    console.warn("[convex-auth] failed to read viewer before OTP verify", err);
  }

  // Minted while the session is still anonymous - that is what authorizes the
  // claim below. A failure here is not fatal to signing in, but it does mean the
  // anonymous data cannot be transferred afterwards, so remember why in order to
  // report it once the sign-in has landed.
  let upgradeNonce: string | null = null;
  let upgradeBlockedBy: unknown = null;
  if (anonymousUserId) {
    try {
      const intent = await client.mutation(
        api.upgrade.prepareAnonymousUpgrade,
        {},
      );
      upgradeNonce = intent?.nonce ?? null;
      if (!upgradeNonce) {
        upgradeBlockedBy = new Error("no upgrade intent was minted");
      }
    } catch (err) {
      upgradeBlockedBy = err;
    }
  }

  const result = await client.action(api.auth.signIn, {
    provider: "resend-otp",
    params: { email, code },
  });
  const tokens = tokensFromSignInResult(result);
  if (!tokens) {
    throw new Error(
      "Sign-in did not return a session - check the code and try again.",
    );
  }
  writeTokens(tokens);
  reauthenticate(client);

  // The sign-in itself has succeeded by now, so losing the anonymous rows is not
  // a reason to pretend the whole flow failed - but it IS a reason to tell the
  // user, who would otherwise silently lose their dictionary, snippets and
  // history. Matches the surfaced error in @looper/data's useUpgradeFromAnonymous;
  // the two paths must not diverge on the same failure.
  if (anonymousUserId && upgradeNonce) {
    try {
      await client.mutation(api.upgrade.claimAnonymousData, {
        anonymousUserId: anonymousUserId as Id<"users">,
        nonce: upgradeNonce,
      });
    } catch (err) {
      // Convex Auth can upgrade the account in place, in which case source and
      // target are already the same user and there is nothing left to transfer.
      if (!isNothingToTransfer(err)) {
        throw new Error(
          `Signed in but data transfer failed: ${describeError(err)}`,
          { cause: err },
        );
      }
    }
  } else if (upgradeBlockedBy) {
    throw new Error(
      `Signed in but data transfer failed: ${describeError(upgradeBlockedBy)}`,
    );
  }
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown";

const isNothingToTransfer = (error: unknown): boolean =>
  error instanceof Error &&
  /Source and target users must differ/i.test(error.message);

/**
 * Signs out of the real account: best-effort `auth:signOut`, then erases the
 * stored tokens and re-authenticates - which, per `fetchTokenFor`, mints a
 * fresh anonymous session immediately after. Sign-out therefore returns to
 * the same invisible-anonymous baseline the app started in, never to a
 * fully-unauthenticated Convex client (remote-dictation.ts and the sync
 * engine still need *a* session to talk to `dictation/*`).
 */
export async function signOutSession(client: ConvexClient): Promise<void> {
  try {
    await client.action(api.auth.signOut, {});
  } catch (err) {
    console.warn("[convex-auth] signOut action failed (continuing)", err);
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  accessTokenListeners.forEach((listener) => listener(null));
  reauthenticate(client);
}

/**
 * Subscribes to `upgrade:viewer`, calling `onUpdate` with the classified
 * `Viewer` on every change. Returns an unsubscribe function.
 */
export function subscribeViewer(
  client: ConvexClient,
  onUpdate: (viewer: Viewer | null) => void,
): () => void {
  return client.onUpdate(
    api.upgrade.viewer,
    {},
    (result: unknown) => onUpdate(viewerFromResult(result)),
    (err: unknown) => {
      console.warn("[convex-auth] viewer subscription error", err);
    },
  );
}
