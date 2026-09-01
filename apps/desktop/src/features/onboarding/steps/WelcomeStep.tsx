import { useLingui as useWelcomeTranslations } from "@lingui/react/macro";
import {
  motion as Motion,
  useReducedMotion as usePrefersReducedMotion,
} from "framer-motion";
import {
  LooperLogo as ProductMark,
  LooperWordmark,
  OnboardingStep as StepFrame,
  PRIMARY_BUTTON_CLASS as primaryActionClassName,
  type StepMotionProps as MotionContract,
} from "./shared";

type WelcomeStepProps = {
  stepMotionProps: MotionContract;
  hasStepTransitioned: boolean;
  onStart: () => void;
  startDisabled?: boolean;
};

const STEP_LAYOUT = { stepKey: "welcome", align: "center" } as const;

const LOGO_SURFACE_PROPS = {
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.45, ease: "easeOut" as const },
  className:
    "onboarding-welcome-mark mb-7 flex h-[100px] w-[100px] items-center justify-center rounded-[28px] bg-[var(--surface-onboarding-logo)] shadow-xl ring-1 ring-[var(--color-onboarding-logo-ring)]",
};

const TITLE_PROPS = {
  className:
    "onboarding-welcome-wordmark text-[3.5rem] font-bold leading-none tracking-[-0.03em] text-content-primary",
  style: { fontFamily: "var(--font-display)" },
};

const UNDERLINE_SVG_PROPS = {
  "aria-hidden": true,
  viewBox: "0 0 300 16",
  preserveAspectRatio: "none",
  className: "absolute inset-x-0 w-full",
  style: { bottom: "-0.80em", height: "0.32em", overflow: "visible" },
} as const;

const UNDERLINE_PATH_PROPS = {
  d: "M 4 11 Q 150 5, 296 6",
  fill: "none",
  stroke: "var(--color-local)",
  strokeWidth: 4,
  strokeLinecap: "round",
  vectorEffect: "non-scaling-stroke",
  animate: { pathLength: 1, opacity: 1 },
  transition: { delay: 0.45, duration: 0.45, ease: [0.4, 0, 0.1, 1] },
} as const;

const WELCOME_TAGLINE_CLASS =
  "mt-8 text-[1.2rem] text-content-muted text-pretty";

const startButtonClassName = [
  "mt-14",
  primaryActionClassName,
  "disabled:opacity-60",
].join(" ");

function WelcomeMark({ reduceMotion }: { reduceMotion: boolean }) {
  const entrance = reduceMotion ? false : { opacity: 0, scale: 0.85 };
  return (
    <Motion.div {...LOGO_SURFACE_PROPS} initial={entrance}>
      <ProductMark size="xl" />
    </Motion.div>
  );
}

function WelcomeWordmark({ reduceMotion }: { reduceMotion: boolean }) {
  const underlineEntrance = reduceMotion
    ? false
    : { pathLength: 0, opacity: 0 };
  return (
    <span className="relative inline-block">
      <h1 {...TITLE_PROPS}>
        <span className="sr-only">Looper</span>
        <LooperWordmark className="h-[3.5rem] w-[15.75rem]" decorative />
      </h1>
      <Motion.svg {...UNDERLINE_SVG_PROPS}>
        <Motion.path {...UNDERLINE_PATH_PROPS} initial={underlineEntrance} />
      </Motion.svg>
    </span>
  );
}

export function WelcomeStep(props: WelcomeStepProps) {
  const {
    stepMotionProps,
    hasStepTransitioned,
    onStart,
    startDisabled = false,
  } = props;
  const { t } = useWelcomeTranslations();
  const reduceMotion = Boolean(usePrefersReducedMotion());
  const tagline = t({
    id: "onboarding.welcome.title",
    message: "Free dictation anywhere",
  });
  const startLabel = t({
    id: "onboarding.welcome.cta",
    message: "Get started",
  });

  return (
    <StepFrame
      {...STEP_LAYOUT}
      motionProps={stepMotionProps}
      initial={hasStepTransitioned ? "enter" : false}
    >
      <WelcomeMark reduceMotion={reduceMotion} />
      <WelcomeWordmark reduceMotion={reduceMotion} />
      <p className={WELCOME_TAGLINE_CLASS}>{tagline}</p>

      <button
        type="button"
        onClick={onStart}
        disabled={startDisabled}
        className={startButtonClassName}
      >
        {startLabel}
      </button>
    </StepFrame>
  );
}
