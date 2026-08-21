import { useLingui } from "@lingui/react/macro";
import { ArrowElbowDownRight as CornerDownRight } from "@phosphor-icons/react";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import type { AppAutomationProps } from "./AppTab.types";

const launchClass = {
  body: "px-2 py-1.5",
  child: "mt-1.5 flex items-center justify-between gap-2 pl-3",
  childLabel: "flex items-center gap-1.5 ui-text-meta text-content-secondary",
  heading: "ui-text-label-strong ui-color-primary",
  icon: "text-content-disabled",
  row: "flex items-center justify-between gap-2",
} as const;

export function LaunchAtLoginSetting(props: AppAutomationProps) {
  const { t } = useLingui();
  const launchEnabled = props.autoLaunchEnabled;
  const backgroundEnabled = launchEnabled && props.startInBackground;
  const toggleLaunch = () => props.onAutoLaunchEnabledChange(!launchEnabled);
  const toggleBackground = () =>
    props.onStartInBackgroundChange(!props.startInBackground);

  return (
    <div className={launchClass.body}>
      <div className={launchClass.row}>
        <span className={launchClass.heading}>
          {t({ id: "settings.app.auto_launch", message: "Launch at Login" })}
        </span>
        <ToggleSwitch
          enabled={launchEnabled}
          onToggle={toggleLaunch}
          ariaLabel={t({
            id: "settings.app.auto_launch.toggle_aria",
            message: "Toggle launch at login",
          })}
        />
      </div>
      <div className={launchClass.child}>
        <div className={launchClass.childLabel}>
          <CornerDownRight
            size={10}
            className={launchClass.icon}
            aria-hidden="true"
          />
          {t({
            id: "settings.app.start_in_background",
            message: "Start in background",
          })}
        </div>
        <ToggleSwitch
          enabled={backgroundEnabled}
          disabled={!launchEnabled}
          onToggle={toggleBackground}
          ariaLabel={t({
            id: "settings.app.start_in_background.toggle_aria",
            message: "Toggle start in background",
          })}
          size="xs"
        />
      </div>
    </div>
  );
}
