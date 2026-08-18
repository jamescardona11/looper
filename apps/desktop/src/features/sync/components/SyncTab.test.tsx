// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const useSyncSession = vi.hoisted(() => vi.fn());

vi.mock("../useSyncSession", () => ({ useSyncSession }));

import SyncTab from "./SyncTab";
import type { SyncSession } from "../useSyncSession";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const baseSession = (): SyncSession => ({
  available: true,
  auth: { status: "anonymous", userId: "anonymous-1" },
  requestOtp: vi.fn().mockResolvedValue(undefined),
  verifyOtp: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  pending: false,
  error: null,
  historyOptIn: false,
  setHistoryOptIn: vi.fn(),
});

function renderSyncTab() {
  return render(
    <I18nProvider i18n={i18n}>
      <SyncTab variants={{ hidden: {}, visible: {}, exit: {} }} />
    </I18nProvider>,
  );
}

describe("SyncTab", () => {
  beforeEach(() => useSyncSession.mockReset());
  afterEach(cleanup);

  test("requests a code for the normalized email before showing verification", async () => {
    const session = baseSession();
    useSyncSession.mockReturnValue(session);
    renderSyncTab();

    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "  person@example.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));

    await waitFor(() =>
      expect(session.requestOtp).toHaveBeenCalledWith("person@example.com"),
    );
    expect(
      screen.getByRole("textbox", { name: "Verification code" }),
    ).toBeTruthy();
  });

  test("shows the identified account and keeps history opt-in explicit", () => {
    const session: SyncSession = {
      ...baseSession(),
      auth: {
        status: "authenticated",
        userId: "person-1",
        email: "person@example.com",
      },
    };
    useSyncSession.mockReturnValue(session);
    renderSyncTab();

    expect(screen.getByText("person@example.com")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("switch", { name: "Sync transcription history" }),
    );
    expect(session.setHistoryOptIn).toHaveBeenCalledWith(true);
  });
});
