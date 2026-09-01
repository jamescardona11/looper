import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@looper/data", () => ({
  useAudioUsage: () => ({
    isLoading: false,
    usage: {
      scope: "cloud",
      today: {
        transcriptions: 1,
        completed: 1,
        failed: 0,
        durationMs: 60_000,
        processedBytes: 1024,
        storedBytes: 0,
      },
      month: {
        transcriptions: 5,
        completed: 4,
        failed: 1,
        durationMs: 300_000,
        processedBytes: 2 * 1024 * 1024,
        storedBytes: 512 * 1024,
      },
      daily: [
        {
          dateMs: Date.UTC(2026, 0, 1),
          transcriptions: 5,
          durationMs: 300_000,
          processedBytes: 2 * 1024 * 1024,
        },
      ],
      byProvider: {
        deepgram: {
          transcriptions: 5,
          completed: 4,
          failed: 1,
          durationMs: 300_000,
          processedBytes: 2 * 1024 * 1024,
          storedBytes: 512 * 1024,
        },
      },
    },
  }),
}));

import { UsageDashboard } from "../usage-dashboard";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
});

afterEach(cleanup);

describe("UsageDashboard", () => {
  it("renders cloud audio totals without exposing model-token accounting", () => {
    render(
      <I18nProvider defaultLocale="en">
        <UsageDashboard />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Cloud activity, clearly scoped." })).toBeVisible();
    expect(screen.getAllByText("5 min").length).toBeGreaterThan(0);
    expect(screen.getByText("2 MB")).toBeVisible();
    expect(screen.getByText("512 KB")).toBeVisible();
    expect(screen.getByText("deepgram")).toBeVisible();
    expect(screen.queryByText(/tokens?/i)).not.toBeInTheDocument();

    const monthlySummary = screen.getByRole("region", { name: "Cloud audio activity" });
    const primaryMetric = within(monthlySummary).getByTestId("usage-primary-metric");
    const secondaryMetrics = within(monthlySummary).getByTestId("usage-secondary-metrics");

    expect(within(primaryMetric).getByText("Transcriptions")).toBeVisible();
    expect(within(primaryMetric).getByText("5")).toBeVisible();
    expect(within(secondaryMetrics).getByText("Audio duration")).toBeVisible();
    expect(within(secondaryMetrics).getByText("Processed audio")).toBeVisible();
    expect(within(secondaryMetrics).getByText("Stored audio")).toBeVisible();
  });
});
