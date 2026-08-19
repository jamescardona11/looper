import { useLingui } from "@lingui/react/macro";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import { AppPermissionStatus } from "./AppPermissionStatus";
import type { AppPrivacyProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import {
  requestAccessibilitySetting,
  requestInputMonitoringSetting,
} from "./app-privacy-native-actions";
import { SettingSurface } from "./app-setting-line";
import type { AppTabControls } from "./useAppTabControls";

const privacyClass = {
  permissionButton:
    "mt-1.5 ui-text-meta ui-color-muted transition-colors hover:text-content-secondary",
  permissionCard: "space-y-3 rounded-lg bg-surface-surface p-2.5",
  permissionCopy:
    "flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5",
  permissionDescription: "min-w-0 ui-text-meta ui-color-disabled",
  permissionLabel:
    "shrink-0 whitespace-nowrap ui-text-label-strong ui-color-primary",
  permissionRow: "px-2 py-1.5",
  permissionTop: "flex items-start justify-between gap-2",
  restartNote: "px-0.5 ui-text-micro ui-color-disabled",
  sectionVisible: "flex flex-col space-y-2",
} as const;

type NativePermission = {
  description: string;
  granted: boolean | null;
  key: "microphone" | "accessibility" | "input-monitoring";
  label: string;
  request: () => Promise<void>;
};

export function AppPrivacySection({
  controls,
  ...props
}: AppPrivacyProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  const capabilities = props.platformCapabilities;
  const nativePermissions: Array<NativePermission | false> = [
    capabilities.requiresNativeMicrophonePermission && {
      key: "microphone",
      label: t({ id: "settings.app.microphone", message: "Microphone" }),
      description: t({
        id: "settings.app.microphone.description",
        message: "required for transcription",
      }),
      granted: props.micPermission,
      request: props.onRequestMicrophonePermission,
    },
    capabilities.requiresAccessibilityPermission && {
      key: "accessibility",
      label: t({ id: "settings.app.accessibility", message: "Accessibility" }),
      description: t({
        id: "settings.app.accessibility.description",
        message: "required for auto-paste",
      }),
      granted: props.accessibilityPermission,
      request: requestAccessibilitySetting,
    },
    capabilities.requiresInputMonitoringPermission && {
      key: "input-monitoring",
      label: t({
        id: "settings.app.input_monitoring",
        message: "Input Monitoring",
      }),
      description: t({
        id: "settings.app.input_monitoring.description",
        message: "required for global shortcuts",
      }),
      granted: props.inputMonitoringPermission,
      request: requestInputMonitoringSetting,
    },
  ];

  return (
    <section
      data-settings-section="privacy"
      className={
        isAppSectionVisible(props.activeSection, "privacy")
          ? privacyClass.sectionVisible
          : "hidden"
      }
    >
      <SectionLabel className="shrink-0">
        {t({
          id: "settings.app.privacy_permissions",
          message: "Privacy & Permissions",
        })}
      </SectionLabel>

      {controls.hasPermissionRows && (
        <div className={privacyClass.permissionCard}>
          {nativePermissions.map((permission) =>
            permission ? (
              <PermissionRow key={permission.key} permission={permission} />
            ) : null,
          )}
        </div>
      )}

      <SettingSurface
        label={t({
          id: "settings.app.hide_overlays_from_capture",
          message: "Hide overlays while sharing",
        })}
        description={t({
          id: "settings.app.hide_overlays_from_capture.body",
          message:
            "Best effort: asks macOS or Windows to exclude Looper pills and previews from screen capture.",
        })}
        control={
          <ToggleSwitch
            enabled={props.hideOverlaysFromCapture}
            onToggle={() =>
              props.onHideOverlaysFromCaptureChange(
                !props.hideOverlaysFromCapture,
              )
            }
            ariaLabel={t({
              id: "settings.app.hide_overlays_from_capture.toggle_aria",
              message: "Toggle overlay capture protection",
            })}
          />
        }
      />
      <SettingSurface
        label={t({ id: "settings.app.analytics", message: "Usage Analytics" })}
        description={t({
          id: "settings.app.analytics.body",
          message: "anonymous, no transcripts or audio shared.",
        })}
        control={
          <ToggleSwitch
            enabled={props.analyticsEnabled}
            onToggle={() =>
              props.onAnalyticsEnabledChange(!props.analyticsEnabled)
            }
            ariaLabel={t({
              id: "settings.app.analytics.toggle_aria",
              message: "Toggle usage analytics",
            })}
          />
        }
      />
      {controls.hasPermissionRows && (
        <p className={privacyClass.restartNote}>
          {t({
            id: "settings.app.permissions_restart_notice",
            message: "Permission changes may require a restart.",
          })}
        </p>
      )}
    </section>
  );
}

function PermissionRow({
  permission: { label, description, granted, request },
}: {
  permission: NativePermission;
}) {
  const { t } = useLingui();
  return (
    <div className={privacyClass.permissionRow}>
      <div className={privacyClass.permissionTop}>
        <div className={privacyClass.permissionCopy}>
          <span className={privacyClass.permissionLabel}>{label}</span>
          <span className={privacyClass.permissionDescription}>
            {description}
          </span>
        </div>
        <AppPermissionStatus granted={granted} />
      </div>
      <button
        type="button"
        onClick={() => void request()}
        className={privacyClass.permissionButton}
      >
        {t({ id: "settings.app.open_settings", message: "Open Settings" })}
      </button>
    </div>
  );
}
