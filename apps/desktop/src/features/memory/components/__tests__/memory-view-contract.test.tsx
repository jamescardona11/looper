// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import MemoryView from "../MemoryView";

const mocks = vi.hoisted(() => ({
  useMemorySearch: vi.fn(),
}));

vi.mock("../../queries", () => ({
  useMemorySearch: (...args: unknown[]) => mocks.useMemorySearch(...args),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "contract",
  messages: {
    "memory.hint.navigate": "NAVIGATE-UNIQUE",
    "memory.hint.open": "OPEN-UNIQUE",
    "memory.privacy.local_search": "PRIVATE-UNIQUE",
    "memory.result.version": "VERSION-UNIQUE",
    "memory.result.final": "FINAL-UNIQUE",
    "memory.result.raw": "RAW-UNIQUE",
  },
});

afterEach(() => {
  cleanup();
  mocks.useMemorySearch.mockReset();
});

describe("MemoryView presentation contract", () => {
  test("applies and consumes a prefill without losing it when the prop clears", async () => {
    mocks.useMemorySearch.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    });
    const consumed = vi.fn();
    const view = (prefillQuery: string | null) => (
      <I18nProvider i18n={i18n}>
        <MemoryView
          isActive
          onOpenResult={vi.fn()}
          prefillQuery={prefillQuery}
          onPrefillConsumed={consumed}
        />
      </I18nProvider>
    );
    const { container, rerender } = render(view("pricing decision"));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Search Memory") as HTMLInputElement).value,
      ).toBe("pricing decision"),
    );
    expect(consumed).toHaveBeenCalledOnce();
    expect(container.firstElementChild?.className).toBe(
      "flex h-full min-h-0 flex-col items-center overflow-hidden px-6 pt-12 pb-6",
    );
    expect(screen.getByLabelText("Memory search").className).toBe(
      "flex min-h-0 w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-border-primary bg-surface-surface shadow-md",
    );

    rerender(view(null));
    expect(
      (screen.getByLabelText("Search Memory") as HTMLInputElement).value,
    ).toBe("pricing decision");
    expect(screen.getByText("NAVIGATE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("OPEN-UNIQUE")).toBeTruthy();
    expect(screen.getByText("PRIVATE-UNIQUE")).toBeTruthy();
  });

  test("keeps translated version controls and selected-row presentation", () => {
    mocks.useMemorySearch.mockReturnValue({
      data: [
        {
          id: "meeting-1",
          source: "meeting",
          title: "Roadmap review",
          occurred_at_ms: 2,
          excerpt: "Approved roadmap",
          final_text: "Approved roadmap",
          raw_text: "road map approved",
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
    });
    render(
      <I18nProvider i18n={i18n}>
        <MemoryView isActive onOpenResult={vi.fn()} />
      </I18nProvider>,
    );

    const row = screen.getByRole("article");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.className).toBe(
      "group mx-1 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors bg-surface-secondary",
    );
    expect(screen.getByLabelText("VERSION-UNIQUE")).toBeTruthy();
    expect(screen.getByRole("button", { name: "FINAL-UNIQUE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "RAW-UNIQUE" })).toBeTruthy();
  });
});
