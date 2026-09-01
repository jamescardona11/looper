import { useTranslation } from "@looper/i18n/react";
import { IconSparkles } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PageSurface } from "@/shared/components/page-surface";

interface OnboardingWizardProps {
  currentStep: string;
  steps: readonly string[];
  stepLabels?: Record<string, string>;
  completedSteps: string[];
  onSkipAll?: () => void;
  children: ReactNode;
}

export function OnboardingWizard({
  currentStep,
  steps,
  stepLabels,
  completedSteps,
  onSkipAll,
  children,
}: OnboardingWizardProps) {
  const { t } = useTranslation();
  const currentIndex = Math.max(0, steps.indexOf(currentStep));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-border border-b bg-background px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <IconSparkles className="size-4" />
          </span>
          <span className="font-medium text-foreground text-sm tracking-tight">
            {t("onboarding.setup")}
          </span>
        </div>
        <StepDots
          steps={steps}
          stepLabels={stepLabels}
          currentIndex={currentIndex}
          completedSteps={completedSteps}
        />
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide md:hidden">
          {currentIndex + 1} / {steps.length}
        </span>
        {onSkipAll ? (
          <button
            type="button"
            onClick={onSkipAll}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-secondary hover:text-foreground sm:min-h-10"
          >
            {t("onboarding.skipSetup")}
          </button>
        ) : (
          <span />
        )}
      </header>

      <PageSurface className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:px-8 sm:py-14">
        <div key={currentStep} className="w-full max-w-4xl">
          {children}
        </div>
      </PageSurface>
    </div>
  );
}

function StepDots({
  steps,
  stepLabels,
  currentIndex,
  completedSteps,
}: {
  steps: readonly string[];
  stepLabels?: Record<string, string>;
  currentIndex: number;
  completedSteps: string[];
}) {
  return (
    <ol className="hidden items-center gap-1.5 md:flex">
      {steps.map((step, i) => {
        const done = completedSteps.includes(step);
        const active = i === currentIndex;
        const label = stepLabels?.[step] ?? step;
        return (
          <li key={step} className="flex items-center gap-1.5">
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full border font-semibold text-[10px] transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/50 bg-primary/20 text-primary"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "text-[11px] tracking-tight transition-colors",
                active
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 ? (
              <span className="ml-1 inline-block h-px w-4 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
