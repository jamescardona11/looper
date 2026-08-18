import type { ReactNode } from "react";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";

const toggleClass = {
  body: "px-2.5 py-2",
  card: "rounded-lg bg-surface-surface",
  description: "mt-0.5 block ui-text-meta ui-color-muted",
  label: "ui-text-label-strong ui-color-primary",
  row: "flex items-center justify-between",
} as const;

export type GeneralFeatureToggle = {
  ariaLabel: string;
  description: ReactNode;
  disabled?: boolean;
  enabled: boolean;
  key: string;
  label: string;
  onToggle: () => void;
};

export function FeatureToggle({
  label,
  description,
  enabled,
  disabled = false,
  onToggle,
  ariaLabel,
}: GeneralFeatureToggle) {
  return (
    <div className={toggleClass.card}>
      <div className={toggleClass.body}>
        <div className={toggleClass.row}>
          <span className={toggleClass.label}>{label}</span>
          <ToggleSwitch
            enabled={enabled}
            disabled={disabled}
            onToggle={onToggle}
            ariaLabel={ariaLabel}
          />
        </div>
        <span className={toggleClass.description}>{description}</span>
      </div>
    </div>
  );
}
