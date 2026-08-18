// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

const licenseApi = vi.hoisted(() => ({
  getDictationStats: vi.fn(),
  getLicenseState: vi.fn(),
  activateLicense: vi.fn(),
  refreshLicense: vi.fn(),
  deactivateLicense: vi.fn(),
}));

vi.mock("../../data/license", () => licenseApi);

import {
  licenseIdentityRefreshTarget,
  licenseKeys,
  useActivateLicense,
  useHydrateLicenseIdentity,
} from "./queries";
import type { LicenseState } from "../../data/license";

const state = (overrides: Partial<LicenseState> = {}): LicenseState => ({
  status: "active",
  licenseGateActive: true,
  trialActive: false,
  trialStartedAt: "2026-08-01T00:00:00.000Z",
  trialEndsAt: "2026-08-15T00:00:00.000Z",
  trialDaysRemaining: 0,
  activationsLimit: 3,
  displayKey: "member-1",
  ...overrides,
});

describe("license queries", () => {
  test("targets only active memberships missing their display identity", () => {
    expect(licenseIdentityRefreshTarget(state())).toBe("member-1");
    expect(
      licenseIdentityRefreshTarget(state({ customerName: "Looper Member" })),
    ).toBeNull();
    expect(licenseIdentityRefreshTarget(state({ status: "trial" }))).toBeNull();
  });

  test("hydrates a missing identity once and updates the shared state cache", async () => {
    const refreshed = state({ customerName: "Looper Member" });
    licenseApi.refreshLicense.mockResolvedValue(refreshed);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { rerender } = renderHook(
      ({ licenseState }) => useHydrateLicenseIdentity(licenseState),
      { initialProps: { licenseState: state() }, wrapper },
    );
    await waitFor(() =>
      expect(licenseApi.refreshLicense).toHaveBeenCalledOnce(),
    );
    expect(queryClient.getQueryData(licenseKeys.state())).toEqual(refreshed);

    rerender({ licenseState: state() });
    expect(licenseApi.refreshLicense).toHaveBeenCalledOnce();
  });

  test("publishes command results to the shared cache and refreshes settings", async () => {
    const refreshed = state({ displayKey: "member-2" });
    licenseApi.activateLicense.mockResolvedValue(refreshed);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useActivateLicense(), { wrapper });

    await act(() => result.current.mutateAsync("license-key"));

    expect(licenseApi.activateLicense.mock.calls[0]?.[0]).toBe("license-key");
    expect(queryClient.getQueryData(licenseKeys.state())).toEqual(refreshed);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["settings"] });
  });
});
