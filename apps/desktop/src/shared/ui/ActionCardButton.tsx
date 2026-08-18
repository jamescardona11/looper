import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import {
  resolveActionCardAccent,
  type ActionCardAccent,
  type ActionCardAccentPreset,
} from "./actionCardButtonAccents";

type ActionCardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  description?: string;
  icon?: ReactNode;
  accent?: Partial<ActionCardAccent>;
  accentPreset?: ActionCardAccentPreset;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  contentClassName?: string;
  fullWidth?: boolean;
};

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function cardStyle(
  accent: ActionCardAccent,
  fullWidth: boolean,
  style?: CSSProperties,
) {
  return {
    "--action-card-border": accent.borderColor,
    "--action-card-background": accent.backgroundColor,
    "--action-card-hover-shadow": fullWidth
      ? "var(--ui-action-card-hover-shadow)"
      : "var(--shadow-sm)",
    "--action-card-rest-shadow": fullWidth
      ? "var(--ui-action-card-rest-shadow)"
      : "none",
    ...style,
  } as CSSProperties;
}

export default function ActionCardButton({
  title,
  description,
  icon,
  accent,
  accentPreset = "interactive",
  iconClassName,
  titleClassName,
  descriptionClassName,
  contentClassName,
  fullWidth = true,
  className,
  style,
  type = "button",
  ...buttonProps
}: ActionCardButtonProps) {
  const cardLayout = fullWidth || Boolean(description);
  const resolvedAccent = resolveActionCardAccent(accentPreset, accent);
  const densityClass = cardLayout
    ? classNames(
        "px-3 py-2.5",
        fullWidth ? "w-full active:translate-y-[2px]" : "inline-flex w-fit",
      )
    : "inline-flex w-auto px-2.5 py-1";

  return (
    <button
      type={type}
      className={classNames(
        "group rounded-lg border border-border-primary bg-surface-surface text-left [box-shadow:var(--action-card-rest-shadow)] outline-hidden transition-[translate,scale,box-shadow,border-color,background-color] duration-100 ease-out hover:border-[var(--action-card-border)] hover:bg-[var(--action-card-background)] hover:[box-shadow:var(--action-card-hover-shadow)] active:scale-[0.98] active:[box-shadow:none] focus-visible:ring-2 focus-visible:ring-border-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:border-border-primary disabled:hover:bg-surface-surface disabled:hover:[box-shadow:var(--action-card-rest-shadow)]",
        densityClass,
        className,
      )}
      style={cardStyle(resolvedAccent, fullWidth, style)}
      {...buttonProps}
    >
      <span
        className={classNames(
          cardLayout
            ? "flex items-center gap-2.5"
            : "flex w-full items-center gap-1.5",
          contentClassName,
        )}
      >
        {icon ? (
          <span
            aria-hidden="true"
            className={classNames(
              cardLayout
                ? "grid size-7 shrink-0 place-items-center leading-none ui-color-primary [&_svg]:block [&_svg]:shrink-0"
                : "flex shrink-0 items-center justify-center leading-none text-[var(--color-text-muted)] transition-colors duration-150 group-hover:text-[var(--color-text-primary)] [&_svg]:block [&_svg]:shrink-0",
              iconClassName,
            )}
          >
            {icon}
          </span>
        ) : null}
        <span
          className={classNames(
            "min-w-0",
            cardLayout && "flex flex-col justify-center",
          )}
        >
          <span
            className={classNames(
              cardLayout
                ? "ui-text-label-strong ui-color-primary block leading-tight"
                : "ui-text-button ui-color-secondary block",
              titleClassName,
            )}
          >
            {title}
          </span>
          {description ? (
            <span
              className={classNames(
                "ui-text-micro ui-color-disabled block",
                cardLayout && "leading-tight",
                descriptionClassName,
              )}
            >
              {description}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
