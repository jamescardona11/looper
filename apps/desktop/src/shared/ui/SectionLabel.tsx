import type { ReactNode } from "react";

type SectionLabelProps = {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

function LabelAccessory({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center ${muted ? "ui-color-muted" : ""}`}
    >
      {children}
    </span>
  );
}

export function SectionLabel({
  icon,
  children,
  trailing,
  className = "",
}: SectionLabelProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {icon ? <LabelAccessory muted>{icon}</LabelAccessory> : null}
      <h2 className="shrink-0 ui-text-body-lg-strong ui-color-secondary">
        {children}
      </h2>
      {trailing ? <LabelAccessory>{trailing}</LabelAccessory> : null}
      <span aria-hidden="true" className="ui-divider-trailing flex-1" />
    </div>
  );
}

export default SectionLabel;
