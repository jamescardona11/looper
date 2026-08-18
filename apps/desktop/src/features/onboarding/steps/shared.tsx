import type { ReactNode as StepContent } from "react";
import {
  motion as Animated,
  type Easing as MotionEasing,
  type Variants as MotionVariants,
} from "framer-motion";

export { LooperLogo } from "../../../shared/ui/LooperLogo";

export type StepMotionProps = {
  custom: 1 | -1;
  variants: MotionVariants;
  animate: string;
  exit: string;
  transition: { duration: number; ease: MotionEasing };
};

type StepFrameProps = {
  stepKey: string;
  motionProps: StepMotionProps;
  initial?: string | false;
  widthClass?: string;
  align?: "top" | "center";
  footer?: StepContent;
  children: StepContent;
};

const stepFrameClassName = (
  widthClass: string,
  align: NonNullable<StepFrameProps["align"]>,
) =>
  [
    "flex min-h-full w-full",
    widthClass,
    "flex-col items-center text-center",
    align === "center" ? "justify-center" : "justify-start pt-10",
  ].join(" ");

const FOOTER_CLASS_NAME = "mt-9 flex w-full flex-col items-center gap-2.5";

export function OnboardingStep(props: StepFrameProps) {
  const {
    stepKey,
    motionProps,
    initial = "enter",
    widthClass = "max-w-md",
    align = "top",
    footer,
    children,
  } = props;
  return (
    <Animated.div
      key={stepKey}
      {...motionProps}
      initial={initial}
      className={stepFrameClassName(widthClass, align)}
    >
      {children}
      {footer ? <div className={FOOTER_CLASS_NAME}>{footer}</div> : null}
    </Animated.div>
  );
}

type HeaderProps = { title: StepContent; subtitle?: StepContent };

const HEADER_CLASS_NAME =
  "mb-8 flex max-w-md flex-col items-center text-center";
const HEADER_TITLE_CLASS_NAME =
  "ui-text-title-lg font-semibold text-content-primary text-balance";
const HEADER_SUBTITLE_CLASS_NAME =
  "mt-2 ui-text-body-lg text-content-muted text-pretty";

export function OnboardingHeader(props: HeaderProps) {
  return (
    <div className={HEADER_CLASS_NAME}>
      <h2 className={HEADER_TITLE_CLASS_NAME}>{props.title}</h2>
      {props.subtitle ? (
        <p className={HEADER_SUBTITLE_CLASS_NAME}>{props.subtitle}</p>
      ) : null}
    </div>
  );
}

type IndicatorProps = { currentStep: number; total: number };

const INDICATOR_TRACK_CLASS_NAME = "flex items-center gap-1.5";
const INDICATOR_DOT_CLASS_NAME = "h-1.5 rounded-full bg-cloud";
const INDICATOR_TRANSITION = { duration: 0.25 };

const indicatorTarget = (index: number, current: number) => ({
  width: index === current ? 20 : 6,
  opacity: index <= current ? 1 : 0.25,
});

export function StepIndicator({ currentStep, total }: IndicatorProps) {
  return (
    <div className={INDICATOR_TRACK_CLASS_NAME}>
      {Array.from({ length: total }, (_, index) => (
        <Animated.div
          key={index}
          className={INDICATOR_DOT_CLASS_NAME}
          animate={indicatorTarget(index, currentStep)}
          transition={INDICATOR_TRANSITION}
        />
      ))}
    </div>
  );
}

const keyboardRow = (geometry: string) => geometry.split(",").map(Number);
const KEYBOARD_GEOMETRY = [
  keyboardRow("1.5,1,1,1,1,1,1,1,1,1,1,1,1.5"),
  keyboardRow("2,1,1,1,1,1,1,1,1,1,1,1.5"),
  keyboardRow("0,1,1,1.5,5,1.5,1,1"),
];

const KEYBOARD_CLASS_NAME =
  "w-full max-w-sm rounded-xl border border-border-primary bg-surface-secondary p-2.5";
const KEY_BASE_CLASS_NAME = "grid h-6 place-items-center rounded-[5px] border";
const SHORTCUT_KEY_CLASS_NAME =
  "shrink-0 border-[var(--color-accent)] bg-accent-10 px-2 shadow-[0_0_0_3px_var(--color-accent-10),0_0_16px_var(--color-accent-20)]";
const REGULAR_KEY_CLASS_NAME = "border-border-primary bg-surface-surface";
const KEY_LABEL_CLASS_NAME =
  "ui-text-nano font-semibold whitespace-nowrap text-[var(--color-accent)]";

const keyboardRowClassName = (rowIndex: number) =>
  rowIndex > 0 ? "flex gap-1 mt-1" : "flex gap-1 ";

function KeyboardKey({ flex, keyLabel }: { flex: number; keyLabel: string }) {
  const shortcut = flex === 0;
  const visualClass = shortcut
    ? SHORTCUT_KEY_CLASS_NAME
    : REGULAR_KEY_CLASS_NAME;
  return (
    <span
      style={shortcut ? undefined : { flex }}
      className={`${KEY_BASE_CLASS_NAME} ${visualClass}`}
    >
      {shortcut ? (
        <span className={KEY_LABEL_CLASS_NAME}>{keyLabel}</span>
      ) : null}
    </span>
  );
}

export function KeyboardHero({ keyLabel }: { keyLabel: string }) {
  return (
    <div aria-hidden="true" className={KEYBOARD_CLASS_NAME}>
      {KEYBOARD_GEOMETRY.map((row, rowIndex) => (
        <div key={rowIndex} className={keyboardRowClassName(rowIndex)}>
          {row.map((flex, keyIndex) => (
            <KeyboardKey key={keyIndex} flex={flex} keyLabel={keyLabel} />
          ))}
        </div>
      ))}
    </div>
  );
}

export const PRIMARY_BUTTON_CLASS = [
  "flex min-w-[160px] items-center justify-center gap-2 rounded-lg",
  "bg-content-primary px-6 py-2.5 ui-text-body-lg font-semibold",
  "text-surface-secondary transition-opacity hover:opacity-90",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");
