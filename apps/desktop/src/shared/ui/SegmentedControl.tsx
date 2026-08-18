import { motion } from "framer-motion";

type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  inactiveButtonClassName?: string;
  activeIndicatorClassName?: string;
  activeIndicatorLayoutId?: string;
};

const DEFAULT_CLASSES = {
  group:
    "flex items-center bg-[var(--color-bg-secondary)] p-1 rounded-lg border border-[var(--color-border-primary)] relative",
  button:
    "relative px-3 py-1 rounded-md ui-text-body-sm-strong capitalize transition-colors duration-200 z-10",
  active: "ui-color-primary",
  inactive: "ui-color-secondary hover:text-[var(--color-text-primary)]",
  indicator:
    "absolute inset-0 bg-[var(--color-bg-elevated)] shadow-sm border border-[var(--color-border-primary)] rounded-md z-[-1]",
} as const;

const KEYBOARD_FOCUS_CLASS =
  "outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-hover";

const INDICATOR_TRANSITION = {
  type: "spring",
  stiffness: 480,
  damping: 42,
  bounce: 0,
} as const;

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type OptionButtonProps<T extends string> = {
  option: SegmentedControlOption<T>;
  selected: boolean;
  onSelect: (value: T) => void;
  buttonClassName?: string;
  activeButtonClassName?: string;
  inactiveButtonClassName?: string;
  activeIndicatorClassName?: string;
  activeIndicatorLayoutId: string;
};

function OptionButton<T extends string>({
  option,
  selected,
  onSelect,
  buttonClassName,
  activeButtonClassName,
  inactiveButtonClassName,
  activeIndicatorClassName,
  activeIndicatorLayoutId,
}: OptionButtonProps<T>) {
  const stateClass = selected
    ? (activeButtonClassName ?? DEFAULT_CLASSES.active)
    : (inactiveButtonClassName ?? DEFAULT_CLASSES.inactive);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={joinClasses(
        buttonClassName ?? DEFAULT_CLASSES.button,
        stateClass,
        KEYBOARD_FOCUS_CLASS,
      )}
      onClick={() => onSelect(option.value)}
    >
      {selected ? (
        <motion.span
          layoutId={activeIndicatorLayoutId}
          className={activeIndicatorClassName ?? DEFAULT_CLASSES.indicator}
          transition={INDICATOR_TRANSITION}
        />
      ) : null}
      <span className="relative z-10">{option.label}</span>
    </button>
  );
}

export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  buttonClassName,
  activeButtonClassName,
  inactiveButtonClassName,
  activeIndicatorClassName,
  activeIndicatorLayoutId = "segmented-control-active",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={joinClasses(
        className ?? DEFAULT_CLASSES.group,
        "overflow-hidden",
      )}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <OptionButton
          key={option.value}
          option={option}
          selected={option.value === value}
          onSelect={onChange}
          buttonClassName={buttonClassName}
          activeButtonClassName={activeButtonClassName}
          inactiveButtonClassName={inactiveButtonClassName}
          activeIndicatorClassName={activeIndicatorClassName}
          activeIndicatorLayoutId={activeIndicatorLayoutId}
        />
      ))}
    </div>
  );
}
