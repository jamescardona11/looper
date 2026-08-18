import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  authStateFromViewer,
  currentAccessToken,
  ensureAnonymousSession,
  requestEmailOtp,
  signOutSession,
  subscribeAccessToken,
  verifyEmailOtp,
  viewerFromResult,
} from "../../src/data/convex-auth";

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  installLocalStorage();
});

describe("convex-auth viewer classification", () => {
  test("viewerFromResult returns null for a missing/malformed viewer", () => {
    expect(viewerFromResult(null)).toBeNull();
    expect(viewerFromResult(undefined)).toBeNull();
    expect(viewerFromResult({})).toBeNull();
    expect(viewerFromResult({ email: "a@b.com" })).toBeNull();
  });

  test("viewerFromResult extracts the fields upgrade:viewer returns", () => {
    expect(
      viewerFromResult({
        userId: "user123",
        email: "a@b.com",
        name: "Ada",
        isAnonymous: false,
      }),
    ).toEqual({
      userId: "user123",
      email: "a@b.com",
      name: "Ada",
      isAnonymous: false,
    });
  });

  test("viewerFromResult defaults isAnonymous to false and drops non-string extras", () => {
    expect(viewerFromResult({ userId: "user123" })).toEqual({
      userId: "user123",
      email: undefined,
      name: undefined,
      isAnonymous: false,
    });
  });

  test("authStateFromViewer: no viewer -> unauthenticated", () => {
    expect(authStateFromViewer(null)).toEqual({ status: "unauthenticated" });
  });

  test("authStateFromViewer: anonymous viewer -> anonymous", () => {
    expect(authStateFromViewer({ userId: "anon1", isAnonymous: true })).toEqual(
      { status: "anonymous", userId: "anon1" },
    );
  });

  test("authStateFromViewer: real viewer -> authenticated with email", () => {
    expect(
      authStateFromViewer({
        userId: "user123",
        email: "a@b.com",
        isAnonymous: false,
      }),
    ).toEqual({ status: "authenticated", userId: "user123", email: "a@b.com" });
  });
});

describe("convex-auth email OTP wiring", () => {
  test("requestEmailOtp calls the resend-otp provider without minting tokens", async () => {
    const client = {
      action: vi.fn().mockResolvedValue({}),
    };

    await requestEmailOtp(client as never, "ada@looper.local");

    expect(client.action).toHaveBeenCalledTimes(1);
    expect(client.action.mock.calls[0]?.[1]).toEqual({
      provider: "resend-otp",
      params: { email: "ada@looper.local" },
    });
    expect(localStorage.getItem("looper.convexAuth.tokens")).toBeNull();
  });

  test("verifyEmailOtp stores tokens, reauthenticates, and claims anonymous data", async () => {
    const client = {
      action: vi.fn().mockResolvedValue({
        tokens: { token: "verified-token", refreshToken: "verified-refresh" },
      }),
      mutation: vi.fn().mockResolvedValue(null),
      query: vi
        .fn()
        .mockResolvedValue({ userId: "anon123", isAnonymous: true }),
      setAuth: vi.fn(),
    };

    await verifyEmailOtp(client as never, "ada@looper.local", "57575757");

    expect(client.action.mock.calls[0]?.[1]).toEqual({
      provider: "resend-otp",
      params: { email: "ada@looper.local", code: "57575757" },
    });
    expect(
      JSON.parse(localStorage.getItem("looper.convexAuth.tokens") ?? "{}"),
    ).toEqual({
      token: "verified-token",
      refreshToken: "verified-refresh",
    });
    expect(client.setAuth).toHaveBeenCalledTimes(1);
    expect(client.mutation.mock.calls[0]?.[1]).toEqual({
      anonymousUserId: "anon123",
    });
  });

  test("signOutSession clears stored tokens and reauthenticates to the anonymous baseline", async () => {
    localStorage.setItem(
      "looper.convexAuth.tokens",
      JSON.stringify({ token: "old-token", refreshToken: "old-refresh" }),
    );
    const client = {
      action: vi.fn().mockResolvedValue(null),
      setAuth: vi.fn(),
    };

    await signOutSession(client as never);

    expect(client.action.mock.calls[0]?.[1]).toEqual({});
    expect(localStorage.getItem("looper.convexAuth.tokens")).toBeNull();
    expect(client.setAuth).toHaveBeenCalledTimes(1);
  });
});

describe("convex-auth token refresh", () => {
  test("setAuth fetcher returns stored tokens and rotates with the refresh token on demand", async () => {
    localStorage.setItem(
      "looper.convexAuth.tokens",
      JSON.stringify({ token: "old-token", refreshToken: "old-refresh" }),
    );
    const client = {
      action: vi.fn().mockResolvedValue({
        tokens: { token: "new-token", refreshToken: "new-refresh" },
      }),
      setAuth: vi.fn(),
    };

    ensureAnonymousSession(client as never);

    const fetchToken = client.setAuth.mock.calls[0]?.[0] as (opts: {
      forceRefreshToken: boolean;
    }) => Promise<string | null>;
    await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe(
      "old-token",
    );
    await expect(fetchToken({ forceRefreshToken: true })).resolves.toBe(
      "new-token",
    );

    expect(client.action.mock.calls[0]?.[1]).toEqual({
      refreshToken: "old-refresh",
    });
    expect(
      JSON.parse(localStorage.getItem("looper.convexAuth.tokens") ?? "{}"),
    ).toEqual({
      token: "new-token",
      refreshToken: "new-refresh",
    });
  });

  test("notifies native bridges for the initial and refreshed access token", async () => {
    localStorage.setItem(
      "looper.convexAuth.tokens",
      JSON.stringify({ token: "old-token", refreshToken: "old-refresh" }),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeAccessToken(listener);
    const client = {
      action: vi.fn().mockResolvedValue({
        tokens: { token: "new-token", refreshToken: "new-refresh" },
      }),
      setAuth: vi.fn(),
    };

    ensureAnonymousSession(client as never);
    const fetchToken = client.setAuth.mock.calls[0]?.[0] as (opts: {
      forceRefreshToken: boolean;
    }) => Promise<string | null>;
    await fetchToken({ forceRefreshToken: true });

    expect(currentAccessToken()).toBe("new-token");
    expect(listener.mock.calls).toEqual([["old-token"], ["new-token"]]);
    unsubscribe();
  });
});
