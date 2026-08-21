import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  test: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useApiKeys: () => ({
    isLoading: false,
    keys: [
      {
        provider: "openai",
        label: "OpenAI",
        configured: false,
        createdAt: null,
        lastTestedAt: null,
        lastTestOk: null,
        lastTestError: null,
      },
      {
        provider: "anthropic",
        label: "Anthropic",
        configured: true,
        createdAt: Date.now(),
        lastTestedAt: Date.now(),
        lastTestOk: true,
        lastTestError: null,
      },
    ],
    save: mocks.save,
    test: mocks.test,
    clear: mocks.clear,
  }),
}));

vi.mock("@/shared/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
    <section {...props}>{children}</section>
  ),
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ApiKeyPanel } from "../api-key-panel";

afterEach(() => {
  cleanup();
  mocks.save.mockReset();
  mocks.test.mockReset();
  mocks.clear.mockReset();
});

describe("ApiKeyPanel", () => {
  it("saves trimmed plaintext keys for an unconfigured provider", async () => {
    mocks.save.mockResolvedValue(undefined);

    render(
      <I18nProvider defaultLocale="en">
        <ApiKeyPanel />
      </I18nProvider>,
    );

    const openAi = screen.getByRole("group", { name: "OpenAI" });
    fireEvent.change(within(openAi).getByLabelText("Paste key"), {
      target: { value: "  sk-live  " },
    });
    fireEvent.click(within(openAi).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.save).toHaveBeenCalledWith("openai", "sk-live");
    });
  });

  it("tests and clears configured providers", async () => {
    mocks.test.mockResolvedValue({ ok: true, error: null });
    mocks.clear.mockResolvedValue(undefined);

    render(
      <I18nProvider defaultLocale="en">
        <ApiKeyPanel />
      </I18nProvider>,
    );

    const anthropic = screen.getByRole("group", { name: "Anthropic" });
    fireEvent.click(within(anthropic).getByRole("button", { name: "Test" }));

    await waitFor(() => {
      expect(mocks.test).toHaveBeenCalledWith("anthropic");
    });

    fireEvent.click(within(anthropic).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mocks.clear).toHaveBeenCalledWith("anthropic");
    });
  });
});
