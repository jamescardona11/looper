// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const calendarMocks = vi.hoisted(() => ({
  getAccess: vi.fn(),
  requestAccess: vi.fn(),
}));

vi.mock("../../../../data/meeting/meeting-awareness", () => ({
  getCalendarAccessStatus: calendarMocks.getAccess,
  requestCalendarAccess: calendarMocks.requestAccess,
}));

import { useCalendarAwarenessControls } from "../useCalendarAwarenessControls";
import { useMediaActionControl } from "../useMediaActionControl";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("app control hooks", () => {
  test("loads calendar access and stores a granted request", async () => {
    calendarMocks.getAccess.mockResolvedValue("not_determined");
    calendarMocks.requestAccess.mockResolvedValue(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onEnabledChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useCalendarAwarenessControls({
          supported: true,
          enabled: false,
          onEnabledChange,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.access).toBe("not_determined"));
    await act(() => result.current.toggle());

    expect(calendarMocks.requestAccess).toHaveBeenCalledOnce();
    expect(onEnabledChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(result.current.access).toBe("authorized"));
  });

  test("maps buttons and horizontal scrubbing across media-action stops", () => {
    const onChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    );
    const { result } = renderHook(
      () => useMediaActionControl("duck25", onChange),
      { wrapper },
    );

    expect(result.current.index).toBe(2);
    expect(result.current.stops).toHaveLength(6);
    act(() => result.current.changeIndex(5));
    expect(onChange).toHaveBeenCalledWith("pause");

    act(() => {
      result.current.startScrub({
        preventDefault: vi.fn(),
        clientX: 100,
      } as never);
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 130 }));
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(onChange).toHaveBeenLastCalledWith("duck75");
  });
});
