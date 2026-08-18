const STORAGE_KEY = "cookie-consent";

export const COOKIE_CONSENT_EVENT = "cookie-consent-change";

export function getCookieConsentChoice(): "accepted" | "declined" | null {
  if (typeof localStorage === "undefined") return "accepted";
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "accepted" || value === "declined" ? value : null;
}

export function storeCookieConsentChoice(choice: "accepted" | "declined") {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode or disabled storage: the component still keeps the choice in memory.
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
}
