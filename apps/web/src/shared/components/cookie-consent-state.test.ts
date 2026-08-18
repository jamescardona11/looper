import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_EVENT,
  getCookieConsentChoice,
  storeCookieConsentChoice,
} from "./cookie-consent-state";

describe("cookie consent state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null until a valid choice is stored", () => {
    expect(getCookieConsentChoice()).toBeNull();

    localStorage.setItem("cookie-consent", "unexpected");

    expect(getCookieConsentChoice()).toBeNull();
  });

  it("persists the choice and notifies same-tab listeners", () => {
    const listener = vi.fn();
    window.addEventListener(COOKIE_CONSENT_EVENT, listener);

    storeCookieConsentChoice("declined");

    expect(getCookieConsentChoice()).toBe("declined");
    expect(listener).toHaveBeenCalledOnce();

    window.removeEventListener(COOKIE_CONSENT_EVENT, listener);
  });
});
