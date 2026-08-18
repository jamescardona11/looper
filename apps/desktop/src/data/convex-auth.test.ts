// @vitest-environment jsdom

import type { ConvexClient } from "convex/browser";
import { beforeEach, describe, expect, test, vi } from "vitest";

const backendApi = vi.hoisted(() => ({
  auth: { signIn: "auth:signIn", signOut: "auth:signOut" },
  upgrade: {
    viewer: "upgrade:viewer",
    claimAnonymousData: "upgrade:claimAnonymousData",
  },
}));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@looper/backend/convex/_generated/api", () => ({ api: backendApi }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  authStateFromViewer,
  currentAccessToken,
  requestEmailOtp,
  setCloudAuthToken,
  signOutSession,
  subscribeAccessToken,
  verifyEmailOtp,
  viewerFromResult,
} from "./convex-auth";

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
    rawClient.mutation.mockResolvedValue(undefined);
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
    expect(rawClient.mutation).toHaveBeenCalledWith(
      backendApi.upgrade.claimAnonymousData,
      { anonymousUserId: "anon-1" },
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
  });
});
