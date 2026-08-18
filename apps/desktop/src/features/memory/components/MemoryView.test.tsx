// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import MemoryView from "./MemoryView";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const renderMemory = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryView isActive onOpenResult={mocks.open} />
    </I18nProvider>,
  );

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  open: vi.fn(),
  useMemorySearch: vi.fn(),
}));

vi.mock("../queries", () => ({
  useMemorySearch: (...args: unknown[]) => mocks.useMemorySearch(...args),
}));

vi.mock("../../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: mocks.copy }),
}));

afterEach(() => {
  cleanup();
  mocks.copy.mockReset();
  mocks.open.mockReset();
  mocks.useMemorySearch.mockReset();
});

describe("MemoryView", () => {
  test("shows provenance, raw/final text and source navigation", () => {
    const result = {
      id: "dictation-1",
      source: "dictation" as const,
      title: "Dictation · Email",
      occurred_at: "2026-07-19T10:00:00Z",
      occurred_at_ms: 1_753_002_000_000,
      excerpt: "Pricing should be $20.",
      final_text: "Pricing should be $20.",
      raw_text: "Pricing should be twenty dollars",
      score: 4,
      app_id: "com.apple.mail",
      workflow_id: "email",
      workflow_name: "Email",
      open_target: "history" as const,
    };
    mocks.useMemorySearch.mockReturnValue({
      data: [result],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    renderMemory();

    expect(screen.getByText("Pricing should be $20.")).toBeTruthy();
    expect(screen.getByText("com.apple.mail")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByText("Pricing should be twenty dollars")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy Memory result" }));
    expect(mocks.copy).toHaveBeenCalledWith("Pricing should be twenty dollars");
    fireEvent.click(
      screen.getByRole("button", { name: "Open Dictation · Email" }),
    );
    expect(mocks.open).toHaveBeenCalledWith(result);
  });

  test("navigates results with arrows and opens the active row with Enter", () => {
    const results = [
      {
        id: "one",
        source: "dictation" as const,
        title: "First",
        occurred_at_ms: 2,
        excerpt: "first result",
        final_text: "first result",
      },
      {
        id: "two",
        source: "dictation" as const,
        title: "Second",
        occurred_at_ms: 1,
        excerpt: "second result",
        final_text: "second result",
      },
    ];
    mocks.useMemorySearch.mockReturnValue({
      data: results,
      isLoading: false,
      isFetching: false,
      error: null,
    });

    renderMemory();
    const palette = screen.getByLabelText("Memory search");
    fireEvent.keyDown(palette, { key: "ArrowDown" });
    fireEvent.keyDown(palette, { key: "Enter" });

    expect(mocks.open).toHaveBeenCalledWith(results[1]);
  });

  test("does not treat Enter on a row control as a palette command", () => {
    const result = {
      id: "one",
      source: "dictation" as const,
      title: "First",
      occurred_at_ms: 2,
      excerpt: "first result",
      final_text: "first result",
      raw_text: "raw result",
    };
    mocks.useMemorySearch.mockReturnValue({
      data: [result],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    renderMemory();
    fireEvent.keyDown(screen.getByRole("button", { name: "Raw" }), {
      key: "Enter",
    });

    expect(mocks.open).not.toHaveBeenCalled();
  });

  test("passes local source, date, app and workflow filters to the query", async () => {
    mocks.useMemorySearch.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    renderMemory();
    fireEvent.click(screen.getByRole("button", { name: "Meetings" }));
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    fireEvent.click(screen.getByRole("button", { name: "More filters…" }));
    fireEvent.change(screen.getByLabelText("Filter Memory by app"), {
      target: { value: " com.apple.mail " },
    });
    fireEvent.change(screen.getByLabelText("Filter Memory by workflow"), {
      target: { value: "email" },
    });

    await waitFor(() => {
      const calls = mocks.useMemorySearch.mock.calls;
      const latestFilter = calls[calls.length - 1]?.[0];
      expect(latestFilter.sources).toEqual(["meeting"]);
      expect(latestFilter.since_ms).toEqual(expect.any(Number));
      expect(latestFilter.app_id).toBe("com.apple.mail");
      expect(latestFilter.workflow_id).toBe("email");
    });
  });
});
