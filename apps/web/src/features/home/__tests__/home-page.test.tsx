import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

type AuthState = { isAuthenticated: boolean; isLoading: boolean };
type CurrentUser = { email: string } | null;

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false } as AuthState,
  user: { email: "ada@looper.local" } as CurrentUser,
  transcriptions: [{ id: "transcription_1" }, { id: "transcription_2" }],
  notes: [{ id: "note_1" }],
  meetings: [{ meetingId: "meeting_1" }, { meetingId: "meeting_2" }],
}));

vi.mock("@looper/data", () => ({
  useCurrentUser: () => ({ user: mocks.user }),
  useDictationHistory: () => ({ items: mocks.transcriptions, isLoading: false }),
  useMeetingSessions: () => ({ sessions: mocks.meetings, isLoading: false }),
  useNotes: () => ({ notes: mocks.notes, isLoading: false }),
}));

vi.mock("@/features/auth", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to }: { to: string }) => <span data-testid="redirect">{to}</span>,
}));

import { HomePage } from "../home-page";

afterEach(() => {
  cleanup();
  mocks.auth = { isAuthenticated: true, isLoading: false };
  mocks.user = { email: "ada@looper.local" };
});

describe("HomePage", () => {
  it("renders the authenticated workspace launchers", () => {
    render(
      <I18nProvider defaultLocale="en">
        <HomePage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: /Welcome back, ada/ })).toBeVisible();
    expect(screen.getByText("Home")).toBeVisible();
    expect(screen.queryByText("Dictation")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Memory/ })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: /Notes/ })).toHaveAttribute("href", "/library");
    const status = screen
      .getByRole("heading", {
        name: "Content synced across your Looper devices",
      })
      .closest("section");
    if (!status) throw new Error("Expected the workspace status section");
    const statusQueries = within(status);
    expect(statusQueries.getByText("Transcriptions").parentElement).toHaveTextContent("2");
    expect(statusQueries.getByText("Notes").parentElement).toHaveTextContent("1");
    expect(statusQueries.getByText("Meetings").parentElement).toHaveTextContent("2");
  });

  it("redirects unauthenticated users to sign in", () => {
    mocks.auth = { isAuthenticated: false, isLoading: false };

    render(
      <I18nProvider defaultLocale="en">
        <HomePage />
      </I18nProvider>,
    );

    expect(screen.getByTestId("redirect")).toHaveTextContent("/sign-in");
  });
});
