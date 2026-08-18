import type { ReactNode } from "react";

const settingLineClass = {
  body: "px-2 py-1.5",
  description: "mt-0.5 block ui-text-micro ui-color-disabled",
  heading: "ui-text-label-strong ui-color-primary",
  row: "flex items-center justify-between gap-2",
  surface: "rounded-lg bg-surface-surface p-2.5",
} as const;

type SettingLineProps = {
  control: ReactNode;
  description?: ReactNode;
  label: ReactNode;
};

export function SettingLine({ control, description, label }: SettingLineProps) {
  return (
    <div className={settingLineClass.body}>
      <div className={settingLineClass.row}>
        <span className={settingLineClass.heading}>{label}</span>
        {control}
      </div>
      {description !== undefined && (
        <span className={settingLineClass.description}>{description}</span>
      )}
    </div>
  );
}

export function SettingSurface(props: SettingLineProps) {
  return (
    <div className={settingLineClass.surface}>
      <SettingLine {...props} />
    </div>
  );
}
