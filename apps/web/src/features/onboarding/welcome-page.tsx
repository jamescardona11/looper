import { useOnboarding } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import {
  IconArrowRight,
  IconCheck,
  IconKey,
  IconMessage,
  IconMicrophone,
} from "@tabler/icons-react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/cn";
import { reportError } from "@/lib/errors";
import { Eyebrow } from "@/shared/components/eyebrow";
import { RouteLoadingState } from "@/shared/components/route-loading-state";
import { Button } from "@/shared/components/ui";
import { OnboardingWizard } from "./components/onboarding-wizard";
import {
  type LaunchTarget,
  type OnboardingAccess,
  type OnboardingIntent,
  onboardingDestination,
} from "./launch";

const STEPS = ["profile", "trial", "tour"] as const;

export function WelcomePage({ launchTarget }: { launchTarget?: LaunchTarget }) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentStep, completedSteps, isComplete, isLoading, complete, skip, skipAll } =
    useOnboarding();
  const navigate = useNavigate();
  const [intent, setIntent] = useState<OnboardingIntent>("chat");
  const [access, setAccess] = useState<OnboardingAccess>("free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading || isLoading) return <RouteLoadingState />;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
  if (isComplete) {
    if (launchTarget === "/settings") {
      return <Navigate to="/settings" search={{ tab: "keys" }} replace />;
    }
    if (launchTarget === "/library") {
      return <Navigate to="/library" search={{ note: undefined }} replace />;
    }
    if (launchTarget === "/agent") {
      return <Navigate to="/agent" search={{ thread: undefined }} replace />;
    }
    if (launchTarget) return <Navigate to={launchTarget} replace />;
    return <Navigate to="/home" replace />;
  }

  const stepLabels: Record<string, string> = {
    profile: t("onboarding.stepLabelProfile"),
    trial: t("onboarding.stepLabelTrial"),
    tour: t("onboarding.stepLabelTour"),
  };
  const step = (STEPS as readonly string[]).includes(currentStep ?? "")
    ? (currentStep as (typeof STEPS)[number])
    : STEPS[0];

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        reportError(cause, {
          fallback: t("onboarding.actionFailed"),
          context: { scope: "onboarding" },
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const advance = (data: unknown) => {
    void run(() => complete(step, data));
  };

  const launch = () => {
    void run(async () => {
      const destination = onboardingDestination(intent, access);
      await navigate({
        to: "/welcome",
        search: { launch: destination.to },
        replace: true,
      });
      await complete("tour", { intent, access });
    });
  };

  return (
    <OnboardingWizard
      currentStep={step}
      steps={STEPS}
      stepLabels={stepLabels}
      completedSteps={completedSteps}
      onSkipAll={() =>
        void run(async () => {
          await skipAll();
          await navigate({ to: "/home" });
        })
      }
    >
      <StepContent
        step={step}
        intent={intent}
        access={access}
        busy={busy}
        error={error}
        onIntentChange={setIntent}
        onAccessChange={setAccess}
        onNext={() => advance(step === "profile" ? { intent } : { access })}
        onSkip={() => void run(() => skip(step))}
        onLaunch={launch}
      />
    </OnboardingWizard>
  );
}

function StepContent({
  step,
  intent,
  access,
  busy,
  error,
  onIntentChange,
  onAccessChange,
  onNext,
  onSkip,
  onLaunch,
}: {
  step: (typeof STEPS)[number];
  intent: OnboardingIntent;
  access: OnboardingAccess;
  busy: boolean;
  error: string | null;
  onIntentChange: (intent: OnboardingIntent) => void;
  onAccessChange: (access: OnboardingAccess) => void;
  onNext: () => void;
  onSkip: () => void;
  onLaunch: () => void;
}) {
  if (step === "profile") {
    return (
      <IntentStep
        value={intent}
        busy={busy}
        error={error}
        onChange={onIntentChange}
        onNext={onNext}
        onSkip={onSkip}
      />
    );
  }
  if (step === "trial") {
    return (
      <AccessStep
        value={access}
        busy={busy}
        error={error}
        onChange={onAccessChange}
        onNext={onNext}
        onSkip={onSkip}
      />
    );
  }
  return (
    <LaunchStep intent={intent} access={access} busy={busy} error={error} onLaunch={onLaunch} />
  );
}

function StepHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-5 max-w-2xl sm:mb-8">
      <Eyebrow className="text-primary">{eyebrow}</Eyebrow>
      <h1 className="mt-3 font-semibold text-3xl tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-xl text-muted-foreground text-sm leading-relaxed sm:text-base">
        {subtitle}
      </p>
    </header>
  );
}

function StepFooter({
  onSkip,
  onNext,
  busy,
}: {
  onSkip: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-border border-t pt-5">
      <Button variant="ghost" onClick={onSkip} disabled={busy} className="min-h-11 sm:min-h-10">
        {t("onboarding.skipStep")}
      </Button>
      <Button onClick={onNext} disabled={busy} size="lg" className="min-h-11 sm:min-h-10">
        {busy ? t("common.loading") : t("onboarding.continueLabel")}
        <IconArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function IntentStep({
  value,
  busy,
  error,
  onChange,
  onNext,
  onSkip,
}: {
  value: OnboardingIntent;
  busy: boolean;
  error: string | null;
  onChange: (intent: OnboardingIntent) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const intents = [
    {
      key: "chat" as const,
      icon: IconMessage,
      title: t("onboarding.intentChat"),
      hint: t("onboarding.intentChatHint"),
    },
    {
      key: "voice" as const,
      icon: IconMicrophone,
      title: t("onboarding.intentVoice"),
      hint: t("onboarding.intentVoiceHint"),
    },
  ];

  return (
    <div>
      <StepHeader
        eyebrow={t("onboarding.step1Eyebrow")}
        title={t("onboarding.step1Title")}
        subtitle={t("onboarding.step1Subtitle")}
      />
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        {intents.map(({ key, icon: Icon, title, hint }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={cn(
                "group flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-32 sm:gap-4 sm:p-5",
                active
                  ? "border-primary bg-primary/[0.07]"
                  : "border-border bg-card hover:border-ring hover:bg-secondary/30",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg border sm:size-10",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-4 sm:size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-medium tracking-tight">{title}</span>
                <span className="mt-0.5 block text-muted-foreground text-xs leading-snug sm:mt-1.5 sm:text-sm sm:leading-relaxed">
                  {hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <InlineError error={error} />
      <StepFooter onSkip={onSkip} onNext={onNext} busy={busy} />
    </div>
  );
}

function AccessStep({
  value,
  busy,
  error,
  onChange,
  onNext,
  onSkip,
}: {
  value: OnboardingAccess;
  busy: boolean;
  error: string | null;
  onChange: (access: OnboardingAccess) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const options = [
    {
      key: "free" as const,
      icon: IconMessage,
      title: t("onboarding.accessFree"),
      hint: t("onboarding.accessFreeHint"),
      meta: t("onboarding.accessFreeMeta"),
    },
    {
      key: "byok" as const,
      icon: IconKey,
      title: t("onboarding.accessByok"),
      hint: t("onboarding.accessByokHint"),
      meta: t("onboarding.accessByokMeta"),
    },
  ];

  return (
    <div>
      <StepHeader
        eyebrow={t("onboarding.step2Eyebrow")}
        title={t("onboarding.step2Title")}
        subtitle={t("onboarding.step2Subtitle")}
      />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {options.map(({ key, icon: Icon, title, hint, meta }, index) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={cn(
                "flex w-full items-start gap-4 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                index > 0 && "border-border border-t",
                active ? "bg-primary/[0.07]" : "hover:bg-secondary/30",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-lg border",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tracking-tight">{title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                    {meta}
                  </span>
                </span>
                <span className="mt-1.5 block max-w-2xl text-muted-foreground text-sm leading-relaxed">
                  {hint}
                </span>
              </span>
              <span
                className={cn(
                  "mt-1 grid size-5 shrink-0 place-items-center rounded-full border",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent",
                )}
              >
                <IconCheck className="size-3" aria-hidden />
              </span>
            </button>
          );
        })}
      </div>
      <InlineError error={error} />
      <StepFooter onSkip={onSkip} onNext={onNext} busy={busy} />
    </div>
  );
}

function LaunchStep({
  intent,
  access,
  busy,
  error,
  onLaunch,
}: {
  intent: OnboardingIntent;
  access: OnboardingAccess;
  busy: boolean;
  error: string | null;
  onLaunch: () => void;
}) {
  const { t } = useTranslation();
  const intentLabel = t(`onboarding.intent.${intent}`);
  const byok = access === "byok";

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <StepHeader
          eyebrow={t("onboarding.step3Eyebrow")}
          title={byok ? t("onboarding.step3ByokTitle") : t("onboarding.step3Title")}
          subtitle={
            byok
              ? t("onboarding.step3ByokSubtitle")
              : t("onboarding.step3Subtitle", { outcome: intentLabel })
          }
        />
        <Button onClick={onLaunch} disabled={busy} size="lg" className="min-h-11 sm:min-h-10">
          {busy
            ? t("common.loading")
            : byok
              ? t("onboarding.openApiKeys")
              : t("onboarding.launchOutcome", { outcome: intentLabel })}
          <IconArrowRight className="size-4" />
        </Button>
        <InlineError error={error} />
      </div>

      <aside className="border-border border-y py-5">
        <Eyebrow>{t("onboarding.readyLabel")}</Eyebrow>
        <dl className="mt-4 space-y-4">
          <SummaryRow label={t("onboarding.firstOutcome")} value={intentLabel} />
          <SummaryRow
            label={t("onboarding.aiAccess")}
            value={byok ? t("onboarding.accessByok") : t("onboarding.accessFree")}
          />
          <SummaryRow
            label={t("onboarding.accountSync")}
            value={t("onboarding.accountSyncValue")}
          />
        </dl>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-sm">{value}</dd>
    </div>
  );
}

function InlineError({ error }: { error: string | null }) {
  return error ? (
    <p className="mt-4 text-destructive text-sm" role="alert">
      {error}
    </p>
  ) : null;
}
