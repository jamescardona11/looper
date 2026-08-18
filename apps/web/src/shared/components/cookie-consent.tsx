// Cookie/analytics consent banner. Shows once, persists the choice, and
// opts PostHog in or out accordingly. Declining stops analytics capture.
import { useTranslation } from "@looper/i18n/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { initPostHog, optOutPostHog } from "@/lib/analytics";
import {
  getCookieConsentChoice,
  storeCookieConsentChoice,
} from "@/shared/components/cookie-consent-state";
import { Button } from "@/shared/components/ui/button";

export function CookieConsent() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<"accepted" | "declined" | null>(getCookieConsentChoice);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (choice) return;
    // Keep consent out of the first paint; analytics remains off until a choice is stored.
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, [choice]);

  if (choice || !ready) return null;

  const decide = (v: "accepted" | "declined") => {
    setChoice(v);
    storeCookieConsentChoice(v);
    if (v === "accepted") initPostHog();
    else optOutPostHog();
  };

  return (
    <div
      data-testid="cookie-consent"
      className="fixed inset-x-0 bottom-0 z-50 border-border border-t bg-card/95 px-3 py-2.5 backdrop-blur sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 sm:gap-4">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs leading-snug sm:text-sm">
          <span className="sm:hidden">{t("cookie.bannerShort")}</span>
          <span className="hidden sm:inline">{t("cookie.bannerText")}</span>{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            {t("legal.privacy")}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="px-2.5 sm:px-3.5"
            onClick={() => decide("declined")}
          >
            {t("cookie.decline")}
          </Button>
          <Button size="sm" className="px-2.5 sm:px-3.5" onClick={() => decide("accepted")}>
            {t("cookie.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
