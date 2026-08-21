// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const updatesApi = vi.hoisted(() => ({ getUpdateStatus: vi.fn() }));
vi.mock("../../../data/updates", () => updatesApi);

import { updateKeys, useUpdateStatus } from "../queries";

beforeEach(() => vi.clearAllMocks());

describe("update query boundary", () => {
  test("keeps the status cache key stable for event invalidation", () => {
    expect(updateKeys.status()).toEqual(["updates", "status"]);
  });

  test("loads update status through the data gateway", async () => {
    updatesApi.getUpdateStatus.mockResolvedValue({ available: false });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateStatus(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updatesApi.getUpdateStatus).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ available: false });
  });
});
