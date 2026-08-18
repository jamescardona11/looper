import { useAuth } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { Link } from "@tanstack/react-router";
import { publicHomePath } from "@/app/public-routes";
import { LooperMark } from "@/shared/components/looper-mark";
import { buttonVariants } from "@/shared/components/ui/button";

export function PublicPageNav({ purchaseRequest = false }: { purchaseRequest?: boolean }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const brand = (
    <>
      <span className="grid size-7 place-items-center rounded-lg border border-border bg-card text-primary">
        <LooperMark className="size-4" />
      </span>
      <span className="font-medium text-sm tracking-tight">Looper</span>
    </>
  );

  return (
    <header className="border-border border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to={publicHomePath()} className="flex items-center gap-2.5">
          {brand}
        </Link>

        {!purchaseRequest && (
          <nav className="hidden items-center gap-6 text-muted-foreground text-sm md:flex">
            <Link to="/pricing" className="transition-colors hover:text-foreground">
              {t("landing.nav.pricing")}
            </Link>
            <Link to="/changelog" className="transition-colors hover:text-foreground">
              {t("landing.footer.changelog")}
            </Link>
            <Link to="/roadmap" className="transition-colors hover:text-foreground">
              {t("landing.footer.roadmap")}
            </Link>
            <Link to="/contact" className="transition-colors hover:text-foreground">
              {t("public.contact")}
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-3">
          {!purchaseRequest ? (
            <>
              {!isAuthenticated ? (
                <Link
                  to="/sign-in"
                  className="hidden text-muted-foreground text-sm transition-colors hover:text-foreground sm:inline"
                >
                  {t("auth.signIn")}
                </Link>
              ) : null}
              <Link
                to={isAuthenticated ? "/home" : "/sign-in"}
                className={buttonVariants({
                  variant: "primary",
                  size: "sm",
                  className: "rounded-lg",
                })}
              >
                {isAuthenticated ? t("nav.openApp") : t("landing.getStarted")}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
