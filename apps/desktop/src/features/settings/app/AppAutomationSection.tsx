import { useLingui } from "@lingui/react/macro";
import SectionLabel from "../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import type { AppAutomationProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import { LaunchAtLoginSetting } from "./app-launch-setting";
import { MediaActionSetting } from "./app-media-action-setting";
import { RetentionSetting } from "./app-retention-setting";
import { SettingLine } from "./app-setting-line";
import type { AppTabControls } from "./useAppTabControls";

const automationClass = {
  filler: "invisible px-0.5 ui-text-micro",
  panel: "flex-1 space-y-6 rounded-lg bg-surface-surface p-2.5",
  visible: "flex flex-col space-y-2",
} as const;

export function AppAutomationSection({
  controls,
  ...props
}: AppAutomationProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  return (
    <section
      data-settings-section="storage"
      className={
        isAppSectionVisible(props.activeSection, "storage")
          ? automationClass.visible
          : "hidden"
      }
    >
      <SectionLabel className="shrink-0">
        {t({ id: "settings.app.automation", message: "Automation" })}
      </SectionLabel>
      <div className={automationClass.panel}>
        {props.platformCapabilities.supportsAutoPauseMedia && (
          <MediaActionSetting {...props} controls={controls} />
        )}
        <SettingLine
          label={t({ id: "settings.app.auto_update", message: "Auto-update" })}
          description={t({
            id: "settings.app.auto_update.body",
            message: "downloads and installs updates in the background.",
          })}
          control={
            <ToggleSwitch
              enabled={props.autoUpdateEnabled}
              onToggle={() =>
                props.onAutoUpdateEnabledChange(!props.autoUpdateEnabled)
              }
              ariaLabel={t({
                id: "settings.app.auto_update.toggle_aria",
                message: "Toggle auto-update",
              })}
            />
          }
        />
        <LaunchAtLoginSetting {...props} />
        <RetentionSetting {...props} controls={controls} />
      </div>
      <p className={automationClass.filler} aria-hidden="true">
        &nbsp;
      </p>
    </section>
  );
}
