// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const personalizationApi = vi.hoisted(() => ({
  getPersonalities: vi.fn(),
  listInstalledApps: vi.fn(),
  listWebsiteIcons: vi.fn(),
  getModeRules: vi.fn(),
}));
vi.mock("../../data/personalization", () => personalizationApi);

import {
  personalizationKeys,
  setModeRulesCache,
  setPersonalitiesCache,
  useWebsiteIconMap,
} from "./queries";

beforeEach(() => vi.clearAllMocks());

describe("personalization query boundary", () => {
  test("keeps each resource in a stable cache branch", () => {
    expect(personalizationKeys.all).toEqual(["personalization"]);
    expect(personalizationKeys.personalities()).toEqual([
      "personalization",
      "personalities",
    ]);
    expect(personalizationKeys.installedApps()).toEqual([
      "personalization",
      "installedApps",
    ]);
    expect(personalizationKeys.websiteIcons(["example.com"])).toEqual([
      "personalization",
      "websiteIcons",
      ["example.com"],
    ]);
    expect(personalizationKeys.modeRules()).toEqual([
      "personalization",
      "modeRules",
    ]);
  });

  test("writes optimistic personalities and rules to their exact caches", () => {
    const client = new QueryClient();
    const personalities = [{ id: "personality-1", name: "Concise" }] as never[];
    const rules = [{ id: "rule-1", mode_id: "personality-1" }] as never[];

    setPersonalitiesCache(client, personalities);
    setModeRulesCache(client, rules);

    expect(client.getQueryData(personalizationKeys.personalities())).toBe(
      personalities,
    );
    expect(client.getQueryData(personalizationKeys.modeRules())).toBe(rules);
  });

  test("normalizes website icon results through the shared policy", async () => {
    personalizationApi.listWebsiteIcons.mockResolvedValue([
      { site: "https://www.example.com/docs", icon_path: "/icon.png" },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useWebsiteIconMap(["example.com"], true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(personalizationApi.listWebsiteIcons).toHaveBeenCalledWith([
      "example.com",
    ]);
    expect(result.current.data).toEqual({ "example.com": "/icon.png" });
  });
});
