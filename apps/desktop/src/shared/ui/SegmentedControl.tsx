import { motion } from "framer-motion";

type Segment<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Array<Segment<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  inactiveButtonClassName?: string;
  activeIndicatorClassName?: string;
  activeIndicatorLayoutId?: string;
};

const PRESENTATION = {
  group:
    "flex items-center bg-[var(--color-bg-secondary)] p-1 rounded-lg border border-[var(--color-border-primary)] relative",
  button:
    "relative px-3 py-1 rounded-md ui-text-body-sm-strong capitalize transition-colors duration-200 z-10",
  active: "ui-color-primary",
  inactive: "ui-color-secondary hover:text-[var(--color-text-primary)]",
  indicator:
    "absolute inset-0 bg-[var(--color-bg-elevated)] shadow-sm border border-[var(--color-border-primary)] rounded-md z-[-1]",
  keyboard:
    "outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-hover",
} as const;

const SPRING = {
  type: "spring",
  stiffness: 480,
  damping: 42,
  bounce: 0,
} as const;

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function segmentPresentation<T extends string>(
  selected: boolean,
  control: SegmentedControlProps<T>,
) {
  return {
    buttonClassName: classes(
      control.buttonClassName ?? PRESENTATION.button,
      selected
        ? (control.activeButtonClassName ?? PRESENTATION.active)
        : (control.inactiveButtonClassName ?? PRESENTATION.inactive),
      PRESENTATION.keyboard,
    ),
    indicatorClassName:
      control.activeIndicatorClassName ?? PRESENTATION.indicator,
    indicatorLayoutId:
      control.activeIndicatorLayoutId ?? "segmented-control-active",
  };
}

function SegmentButton<T extends string>({
  option,
  selected,
  control,
}: {
  option: Segment<T>;
  selected: boolean;
  control: SegmentedControlProps<T>;
}) {
  const view = segmentPresentation(selected, control);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={view.buttonClassName}
      onClick={() => control.onChange(option.value)}
    >
      {selected ? (
        <motion.span
          layoutId={view.indicatorLayoutId}
          className={view.indicatorClassName}
          transition={SPRING}
        />
      ) : null}
      <span className="relative z-10">{option.label}</span>
    </button>
  );
}

export default function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  return (
    <div
      className={classes(
        props.className ?? PRESENTATION.group,
        "overflow-hidden",
      )}
      role="radiogroup"
      aria-label={props.ariaLabel}
    >
      {props.options.map((option) => (
        <SegmentButton
          key={option.value}
          option={option}
          selected={option.value === props.value}
          control={props}
        />
      ))}
    </div>
  );
}
