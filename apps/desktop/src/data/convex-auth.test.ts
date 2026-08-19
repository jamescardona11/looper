// @vitest-environment jsdom

import type { ConvexClient } from "convex/browser";
import { beforeEach, describe, expect, test, vi } from "vitest";

const backendApi = vi.hoisted(() => ({
  auth: { signIn: "auth:signIn", signOut: "auth:signOut" },
  upgrade: {
    viewer: "upgrade:viewer",
    prepareAnonymousUpgrade: "upgrade:prepareAnonymousUpgrade",
    claimAnonymousData: "upgrade:claimAnonymousData",
  },
}));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@looper/backend/convex/_generated/api", () => ({ api: backendApi }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  authStateFromViewer,
  currentAccessToken,
  ensureAnonymousSession,
  requestEmailOtp,
  setCloudAuthToken,
  signOutSession,
  subscribeAccessToken,
  verifyEmailOtp,
  viewerFromResult,
} from "./convex-auth";

const TOKEN_STORAGE_KEY = "looper.convexAuth.tokens";

function fakeClient() {
  return {
    action: vi.fn(),
    mutation: vi.fn(),
    query: vi.fn(),
    setAuth: vi.fn(),
  };
}

describe("desktop cloud authentication boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  test("validates viewer payloads and classifies session state", () => {
    expect(viewerFromResult({ userId: 42 })).toBeNull();
    expect(viewerFromResult(null)).toBeNull();
    expect(viewerFromResult(undefined)).toBeNull();
    expect(viewerFromResult({})).toBeNull();
    expect(viewerFromResult({ email: "person@example.com" })).toBeNull();
    expect(viewerFromResult({ userId: "user-1", name: 7 })).toEqual({
      userId: "user-1",
      email: undefined,
      name: undefined,
      isAnonymous: false,
    });
    expect(
      viewerFromResult({
        userId: "user-1",
        email: "person@example.com",
        name: "Person",
        isAnonymous: false,
      }),
    ).toEqual({
      userId: "user-1",
      email: "person@example.com",
      name: "Person",
      isAnonymous: false,
    });
    expect(authStateFromViewer(null)).toEqual({ status: "unauthenticated" });
    expect(
      authStateFromViewer({ userId: "anon-1", isAnonymous: true }),
    ).toEqual({ status: "anonymous", userId: "anon-1" });
    expect(
      authStateFromViewer({
        userId: "user-1",
        email: "person@example.com",
        isAnonymous: false,
      }),
    ).toEqual({
      status: "authenticated",
      userId: "user-1",
      email: "person@example.com",
    });
  });

  test("requesting a code emails it without minting a session", async () => {
    const rawClient = fakeClient();
    rawClient.action.mockResolvedValue(undefined);

    await requestEmailOtp(
      rawClient as unknown as ConvexClient,
      "person@example.com",
    );

    expect(rawClient.action).toHaveBeenCalledOnce();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(rawClient.setAuth).not.toHaveBeenCalled();
  });

  test("requests and verifies email codes while upgrading anonymous data", async () => {
    const rawClient = fakeClient();
    const client = rawClient as unknown as ConvexClient;
    rawClient.query.mockResolvedValue({
      userId: "anon-1",
      isAnonymous: true,
    });
    rawClient.action.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      tokens: { token: "access-1", refreshToken: "refresh-1" },
    });
    rawClient.mutation
      .mockResolvedValueOnce({ nonce: "nonce-1" })
      .mockResolvedValueOnce(undefined);
    const listener = vi.fn();
    const unsubscribe = subscribeAccessToken(listener);

    await requestEmailOtp(client, "person@example.com");
    await verifyEmailOtp(client, "person@example.com", "123456");

    expect(rawClient.action).toHaveBeenNthCalledWith(
      1,
      backendApi.auth.signIn,
      {
        provider: "resend-otp",
        params: { email: "person@example.com" },
      },
    );
    expect(rawClient.action).toHaveBeenNthCalledWith(
      2,
      backendApi.auth.signIn,
      {
        provider: "resend-otp",
        params: { email: "person@example.com", code: "123456" },
      },
    );
    expect(rawClient.mutation).toHaveBeenNthCalledWith(
      1,
      backendApi.upgrade.prepareAnonymousUpgrade,
      {},
    );
    expect(rawClient.mutation).toHaveBeenNthCalledWith(
      2,
      backendApi.upgrade.claimAnonymousData,
      { anonymousUserId: "anon-1", nonce: "nonce-1" },
    );
    expect(currentAccessToken()).toBe("access-1");
    expect(listener).toHaveBeenLastCalledWith("access-1");
    expect(rawClient.setAuth).toHaveBeenCalledOnce();
    unsubscribe();
  });

  test("clears the current session and synchronizes the native token", async () => {
    const rawClient = fakeClient();
    const client = rawClient as unknown as ConvexClient;
    rawClient.query.mockResolvedValue(null);
    rawClient.action.mockResolvedValueOnce({
      tokens: { token: "access-1", refreshToken: "refresh-1" },
    });
    await verifyEmailOtp(client, "person@example.com", "123456");
    rawClient.action.mockResolvedValueOnce(undefined);

    await signOutSession(client);
    await setCloudAuthToken(null);

    expect(currentAccessToken()).toBeNull();
    expect(rawClient.action).toHaveBeenLastCalledWith(
      backendApi.auth.signOut,
      {},
    );
    expect(invoke).toHaveBeenCalledWith("set_cloud_auth_token", {
      token: null,
    });
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(rawClient.setAuth).toHaveBeenCalled();
  });

  test("serves the stored token and rotates it only when a refresh is forced", async () => {
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ token: "access-1", refreshToken: "refresh-1" }),
    );
    const rawClient = fakeClient();
    rawClient.action.mockResolvedValue({
      tokens: { token: "access-2", refreshToken: "refresh-2" },
    });
    const listener = vi.fn();
    const unsubscribe = subscribeAccessToken(listener);

    ensureAnonymousSession(rawClient as unknown as ConvexClient);
    const fetchToken = rawClient.setAuth.mock.calls[0]?.[0] as (opts: {
      forceRefreshToken: boolean;
    }) => Promise<string | null>;

    await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe(
      "access-1",
    );
    expect(rawClient.action).not.toHaveBeenCalled();

    await expect(fetchToken({ forceRefreshToken: true })).resolves.toBe(
      "access-2",
    );
    expect(rawClient.action).toHaveBeenCalledWith(backendApi.auth.signIn, {
      refreshToken: "refresh-1",
    });
    expect(JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) ?? "{}")).toEqual(
      {
        token: "access-2",
        refreshToken: "refresh-2",
      },
    );
    expect(listener.mock.calls).toEqual([["access-1"], ["access-2"]]);
    unsubscribe();
  });
});
