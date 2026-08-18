import { useAuth } from "@looper/data";
import { I18nProvider, useTranslation } from "@looper/i18n/react";
import { IconAlertTriangle, IconChevronRight, IconMessage2 } from "@tabler/icons-react";
import { type ErrorComponentProps, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { APP_DESTINATIONS, isAppPath } from "@/app/navigation";
import { publicHomePath } from "@/app/public-routes";
import { captureError } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { CookieConsent } from "@/shared/components/cookie-consent";
import { LooperMark } from "@/shared/components/looper-mark";
import {
  COOKIE_CONSENT_EVENT,
  getCookieConsentChoice,
} from "@/shared/components/cookie-consent-state";
import { RouteLoadingState } from "@/shared/components/route-loading-state";
import { PageSurface } from "@/shared/components/page-surface";
import { buttonVariants } from "@/shared/components/ui/button";

const loadAuthenticatedShell = () => import("@/app/authenticated-shell");
const AuthenticatedShell = lazy(loadAuthenticatedShell);
const FeedbackRuntime = lazy(() => import("@/app/feedback-runtime"));
const ToasterRuntime = lazy(() => import("@/app/toaster-runtime"));

export function WebAppShell() {
  return (
    <I18nProvider>
      <AppShell />
      <GlobalOverlays />
    </I18nProvider>
  );
}

const DARK_OVERLAY_ROUTES = new Set(["/", "/landing"]);
function GlobalOverlays() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className={DARK_OVERLAY_ROUTES.has(pathname) ? "dark" : undefined}>
      <CookieConsent />
      <DeferredToasterRuntime />
      <FeedbackLauncher />
    </div>
  );
}

function DeferredToasterRuntime() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback) => window.setTimeout(callback, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setReady(true), { timeout: 1000 });
    return () => cancel(handle);
  }, []);

  return ready ? (
    <Suspense fallback={null}>
      <ToasterRuntime />
    </Suspense>
  ) : null;
}

function FeedbackLauncher() {
  const { t } = useTranslation();
  const { isLoading: authLoading } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isProductRoute = isAppPath(pathname) || pathname === "/admin";
  const [open, setOpen] = useState(false);
  const [cookieConsentPending, setCookieConsentPending] = useState(
    () => getCookieConsentChoice() === null,
  );

  useEffect(() => {
    const syncConsent = () => setCookieConsentPending(getCookieConsentChoice() === null);
    window.addEventListener(COOKIE_CONSENT_EVENT, syncConsent);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, syncConsent);
      window.removeEventListener("storage", syncConsent);
    };
  }, []);

  if (pathname === "/welcome" || (authLoading && isProductRoute)) return null;

  if (open) {
    return (
      <Suspense fallback={null}>
        <FeedbackRuntime open onOpenChange={setOpen} />
      </Suspense>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("feedback.title")}
      className={cn(
        "touch-target fixed z-50 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-[color,top,bottom] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isProductRoute
          ? "top-1.5 right-3 size-9 sm:top-auto sm:right-4 sm:bottom-4 sm:size-11"
          : "right-4 bottom-4 size-11",
        cookieConsentPending ? "hidden" : isProductRoute ? "flex" : "hidden sm:flex",
      )}
    >
      <IconMessage2 className="size-5" aria-hidden />
    </button>
  );
}

function AppShell() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isProductRoute = isAppPath(pathname) || pathname === "/admin";
  const showChrome = isAuthenticated && isProductRoute;
  const publicAuth = { pending: false };
  const destination = APP_DESTINATIONS.find((item) => item.to === pathname);
  const shellLabel =
    pathname === "/admin" ? t("nav.admin") : destination ? t(destination.labelKey) : "Looper";

  if (showChrome) {
    return (
      <Suspense fallback={<RouteLoadingState shellLabel={shellLabel} />}>
        <AuthenticatedShell />
      </Suspense>
    );
  }

  if ((isLoading || publicAuth.pending) && pathname !== "/" && pathname !== publicHomePath()) {
    return <RouteLoadingState shellLabel={isProductRoute ? shellLabel : undefined} />;
  }

  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
}

export function RootErrorBoundary({ error, reset }: ErrorComponentProps) {
  return (
    <I18nProvider>
      <RootErrorContent error={error} reset={reset} />
    </I18nProvider>
  );
}

function RootErrorContent({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isEmbeddedInApp = isAppPath(pathname) || pathname === "/admin";

  useEffect(() => {
    captureError(error);
  }, [error]);

  return (
    <PageSurface className={cn(isEmbeddedInApp ? "min-h-full" : "min-h-screen")}>
      {isEmbeddedInApp ? null : <FallbackHeader />}
      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
        <IconAlertTriangle className="size-9 text-primary" aria-hidden />
        <p className="mt-8 font-mono text-primary text-xs uppercase tracking-wide">
          {t("status.systemError")}
        </p>
        <h1 className="mt-4 max-w-xl font-bold font-display text-4xl leading-[0.95] tracking-tighter md:text-5xl">
          {t("common.error")}
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
          {t("status.errorHint")}
        </p>
        {import.meta.env.DEV ? (
          <pre className="mt-6 max-w-2xl overflow-x-auto border-border border-l pl-4 font-mono text-muted-foreground text-xs leading-relaxed">
            {error.message}
          </pre>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className={buttonVariants({ variant: "primary", className: "rounded-lg" })}
          >
            {t("common.retry")}
            <IconChevronRight className="size-4" aria-hidden />
          </button>
          <Link
            to={publicHomePath()}
            className={buttonVariants({ variant: "secondary", className: "rounded-lg" })}
          >
            {t("status.backHome")}
          </Link>
        </div>
      </section>
    </PageSurface>
  );
}

export function RootNotFound() {
  const { t } = useTranslation();

  return (
    <PageSurface className="min-h-screen">
      <FallbackHeader />
      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="font-mono text-primary text-xs uppercase tracking-wide">404</p>
        <h1 className="mt-4 max-w-xl font-bold font-display text-4xl leading-[0.95] tracking-tighter md:text-5xl">
          {t("status.pageNotFound")}
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
          {t("status.notFoundHint")}
        </p>
        <Link
          to={publicHomePath()}
          className={buttonVariants({ variant: "primary", className: "mt-8 rounded-lg" })}
        >
          {t("status.backHome")}
          <IconChevronRight className="size-4" aria-hidden />
        </Link>
      </section>
    </PageSurface>
  );
}

function FallbackHeader() {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
        <Link to={publicHomePath()} className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg border border-border bg-card text-primary">
            <LooperMark className="size-4" />
          </span>
          <span className="font-medium text-sm tracking-tight">Looper</span>
        </Link>
      </div>
    </header>
  );
}
