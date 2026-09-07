import { useAuth } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import {
  IconBrandApple,
  IconBrandGithub,
  IconBrandGoogle,
  IconDatabase,
  IconDeviceDesktop,
  IconLock,
  IconMicrophone,
  IconSparkles,
} from "@tabler/icons-react";
import { Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PageSurface } from "@/shared/components/page-surface";
import { AnonymousButton } from "./components/anonymous-button";
import { EmailOtpForm } from "./components/email-otp-form";

export function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <PageSurface className="min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl grid-cols-1 content-start gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:content-center lg:items-center lg:gap-20 lg:py-16">
        <Hero />
        <AuthCard />
      </div>
    </PageSurface>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-10 lg:justify-between">
      <div>
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg border border-border bg-card text-primary">
            <IconSparkles className="size-4" aria-hidden />
          </span>
          <Eyebrow className="text-foreground">{t("signIn.badge")}</Eyebrow>
        </Link>
        <div className="hidden lg:block">
          <h1 className="mt-8 max-w-xl font-medium text-4xl leading-[0.98] tracking-tighter sm:text-5xl">
            {t("signIn.heroHeadline")}
            <br />
            <span className="text-primary">{t("signIn.heroHeadlineAccent")}</span>
          </h1>
          <p className="mt-5 max-w-md text-muted-foreground text-sm leading-relaxed md:text-base">
            {t("signIn.heroSubtitle")}
          </p>
        </div>
      </div>

      <ul className="hidden border-border border-y lg:block">
        <Feature
          icon={<IconMicrophone className="size-4" aria-hidden="true" />}
          title={t("signIn.feature.dictationTitle")}
          hint={t("signIn.feature.dictationHint")}
        />
        <Feature
          icon={<IconLock className="size-4" aria-hidden="true" />}
          title={t("signIn.feature.privacyTitle")}
          hint={t("signIn.feature.privacyHint")}
        />
        <Feature
          icon={<IconDeviceDesktop className="size-4" aria-hidden="true" />}
          title={t("signIn.feature.crossPlatformTitle")}
          hint={t("signIn.feature.crossPlatformHint")}
        />
        <Feature
          icon={<IconDatabase className="size-4" aria-hidden="true" />}
          title={t("signIn.feature.assistantTitle")}
          hint={t("signIn.feature.assistantHint")}
        />
      </ul>

      <div className="hidden items-center gap-6 text-[11px] text-muted-foreground tabular-nums lg:flex">
        <span className="inline-flex items-center gap-2">
          <IconDeviceDesktop className="size-3.5" aria-hidden="true" />
          {t("signIn.statsPlatforms")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-primary" />
          {t("signIn.statsPrivate")}
        </span>
      </div>
    </section>
  );
}

function AuthCard() {
  const { t } = useTranslation();
  return (
    <section className="flex items-center lg:justify-end">
      <div className="w-full">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("auth.signIn")}
              </p>
              <h2 className="mt-1 font-bold font-display text-xl tracking-tighter">
                {t("auth.welcomeBack")}
              </h2>
            </div>
            <Link
              to="/"
              aria-label={t("signIn.badge")}
              className="grid size-9 place-items-center rounded-full border border-border bg-background text-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconSparkles className="size-4" aria-hidden="true" />
            </Link>
          </header>

          <SocialButtons />

          <Divider text={t("auth.orContinueWithEmail")} />

          <EmailOtpForm />

          <Divider text={t("common.or")} />
          <AnonymousButton />

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            {t("auth.legalPrefix")}{" "}
            <Link to="/terms" className="text-foreground underline underline-offset-2">
              {t("legal.terms")}
            </Link>{" "}
            {t("common.and")}{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-2">
              {t("legal.privacy")}
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <li className="flex items-start gap-3.5 border-border border-b py-4 last:border-0">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <div>
        <p className="font-medium text-sm tracking-tight">{title}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{hint}</p>
      </div>
    </li>
  );
}

function SocialButtons() {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const buttons = [
    {
      provider: "google",
      label: t("auth.continueWithGoogle"),
      icon: <IconBrandGoogle className="size-4" aria-hidden="true" />,
    },
    {
      provider: "apple",
      label: t("auth.continueWithApple"),
      icon: <IconBrandApple className="size-4" aria-hidden="true" />,
    },
    {
      provider: "github",
      label: t("auth.continueWithGithub"),
      icon: <IconBrandGithub className="size-4" aria-hidden="true" />,
    },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
      {buttons.map((b) => {
        const isPending = pending === b.provider;
        return (
          <button
            key={b.provider}
            type="button"
            disabled={pending !== null}
            aria-busy={isPending}
            onClick={() => {
              setPending(b.provider);
              void signIn(b.provider).catch((e) => {
                setPending(null);
                toast.error(friendlyError(e, t("signIn.signInError")));
              });
            }}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background px-3 text-foreground text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:h-10"
          >
            {isPending ? (
              <span className="size-4 rounded-full border-2 border-muted border-t-foreground motion-safe:animate-spin motion-reduce:animate-none" />
            ) : (
              b.icon
            )}
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

function Divider({ text }: { text: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-border border-t" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {text}
        </span>
      </div>
    </div>
  );
}
