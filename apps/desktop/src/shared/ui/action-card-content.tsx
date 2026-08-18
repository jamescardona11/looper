import type { ReactNode } from "react";
import type { ActionCardPresentation } from "./action-card-presentation";

type ActionCardContentProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  view: ActionCardPresentation;
};

export function ActionCardContent({
  title,
  description,
  icon,
  view,
}: ActionCardContentProps) {
  const iconSlot = icon ? (
    <span aria-hidden="true" className={view.iconClassName}>
      {icon}
    </span>
  ) : null;
  const descriptionSlot = description ? (
    <span className={view.descriptionClassName}>{description}</span>
  ) : null;

  return (
    <span className={view.contentClassName}>
      {iconSlot}
      <span className={view.textClassName}>
        <span className={view.titleClassName}>{title}</span>
        {descriptionSlot}
      </span>
    </span>
  );
}
