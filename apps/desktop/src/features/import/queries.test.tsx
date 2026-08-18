// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const importApi = vi.hoisted(() => ({
  detectImportableApps: vi.fn(),
  previewImport: vi.fn(),
}));

vi.mock("../../data/imports", () => importApi);

import { importKeys, useImportableApps, useImportPreview } from "./queries";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => vi.clearAllMocks());

describe("import query boundary", () => {
  test("keeps detected apps and previews in separate cache branches", () => {
    expect(importKeys.all).toEqual(["import"]);
    expect(importKeys.detected()).toEqual(["import", "detected"]);
    expect(importKeys.preview("notes")).toEqual([
      "import",
      "preview",
      "notes",
    ]);
  });

  test("respects the app detection enable gate", async () => {
    importApi.detectImportableApps.mockResolvedValue([{ id: "notes" }]);
    const { rerender } = renderHook(
      ({ enabled }) => useImportableApps(enabled),
      { initialProps: { enabled: false }, wrapper },
    );

    expect(importApi.detectImportableApps).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() =>
      expect(importApi.detectImportableApps).toHaveBeenCalledOnce(),
    );
  });

  test("does not request a preview until an app is selected", async () => {
    importApi.previewImport.mockResolvedValue({ id: "notes" });
    const { rerender } = renderHook(({ id }) => useImportPreview(id), {
      initialProps: { id: null as string | null },
      wrapper,
    });

    expect(importApi.previewImport).not.toHaveBeenCalled();
    rerender({ id: "notes" });
    await waitFor(() =>
      expect(importApi.previewImport).toHaveBeenCalledWith("notes"),
    );
  });
});
