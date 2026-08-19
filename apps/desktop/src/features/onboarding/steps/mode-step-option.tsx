import type { ReactNode } from "react";

type ModeOptionProps = {
  active: boolean;
  disabled?: boolean;
  tone: "local" | "cloud";
  icon: ReactNode;
  title: string;
  badge?: string;
  description: string;
  onClick: () => void;
};

export function ModeStepOption({
  active,
  disabled = false,
  tone,
  icon,
  title,
  badge,
  description,
  onClick,
}: ModeOptionProps) {
  const activeClasses =
    tone === "local"
      ? "border-local-30 bg-local-5 text-local-50"
      : "border-cloud-30 bg-cloud-5 text-cloud-50";

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-active={active}
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
      className={`onboarding-mode-option min-h-48 rounded-lg border p-4 text-left transition-colors ${
        active
          ? activeClasses
          : "border-border-primary bg-surface-surface text-content-muted hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
      }`}
    >
      {icon}
      <span className="mt-5 flex items-center gap-2">
        <span className="ui-text-body-strong text-content-primary">
          {title}
        </span>
        {badge ? (
          <span className="ui-text-meta uppercase text-local-50">{badge}</span>
        ) : null}
      </span>
      <span className="mt-2 block ui-text-body-sm text-pretty">
        {description}
      </span>
    </button>
  );
}
