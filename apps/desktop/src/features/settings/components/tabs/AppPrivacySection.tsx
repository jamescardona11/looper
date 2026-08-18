import { useLingui } from "@lingui/react/macro";
import {
  checkMacInputMonitoringPermission,
  requestMacAccessibilityPermission,
  requestMacInputMonitoringPermission,
} from "../../../../shared/lib/macosPermissions";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import {
  openAccessibilitySettings,
  openInputMonitoringSettings,
} from "../../../../data/settings";
import { AppPermissionStatus } from "./AppPermissionStatus";
import type { AppPrivacyProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import type { AppTabControls } from "./useAppTabControls";

export function AppPrivacySection({
  controls,
  ...props
}: AppPrivacyProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  const capabilities = props.platformCapabilities;

  return (
    <section
      data-settings-section="privacy"
      className={
        isAppSectionVisible(props.activeSection, "privacy")
          ? "flex flex-col space-y-2"
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
        <div className="space-y-3 rounded-lg bg-surface-surface p-2.5">
          {capabilities.requiresNativeMicrophonePermission && (
            <PermissionRow
              label={t({
                id: "settings.app.microphone",
                message: "Microphone",
              })}
              description={t({
                id: "settings.app.microphone.description",
                message: "required for transcription",
              })}
              granted={props.micPermission}
              onRequest={props.onRequestMicrophonePermission}
            />
          )}
          {capabilities.requiresAccessibilityPermission && (
            <PermissionRow
              label={t({
                id: "settings.app.accessibility",
                message: "Accessibility",
              })}
              description={t({
                id: "settings.app.accessibility.description",
                message: "required for auto-paste",
              })}
              granted={props.accessibilityPermission}
              onRequest={requestAccessibility}
            />
          )}
          {capabilities.requiresInputMonitoringPermission && (
            <PermissionRow
              label={t({
                id: "settings.app.input_monitoring",
                message: "Input Monitoring",
              })}
              description={t({
                id: "settings.app.input_monitoring.description",
                message: "required for global shortcuts",
              })}
              granted={props.inputMonitoringPermission}
              onRequest={requestInputMonitoring}
            />
          )}
        </div>
      )}

      <PrivacyToggle
        label={t({
          id: "settings.app.hide_overlays_from_capture",
          message: "Hide overlays while sharing",
        })}
        description={t({
          id: "settings.app.hide_overlays_from_capture.body",
          message:
            "Best effort: asks macOS or Windows to exclude Looper pills and previews from screen capture.",
        })}
        enabled={props.hideOverlaysFromCapture}
        onToggle={() =>
          props.onHideOverlaysFromCaptureChange(!props.hideOverlaysFromCapture)
        }
        ariaLabel={t({
          id: "settings.app.hide_overlays_from_capture.toggle_aria",
          message: "Toggle overlay capture protection",
        })}
      />
      <PrivacyToggle
        label={t({ id: "settings.app.analytics", message: "Usage Analytics" })}
        description={t({
          id: "settings.app.analytics.body",
          message: "anonymous, no transcripts or audio shared.",
        })}
        enabled={props.analyticsEnabled}
        onToggle={() => props.onAnalyticsEnabledChange(!props.analyticsEnabled)}
        ariaLabel={t({
          id: "settings.app.analytics.toggle_aria",
          message: "Toggle usage analytics",
        })}
      />
      {controls.hasPermissionRows && (
        <p className="px-0.5 ui-text-micro ui-color-disabled">
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
  label,
  description,
  granted,
  onRequest,
}: {
  label: string;
  description: string;
  granted: boolean | null;
  onRequest: () => Promise<void>;
}) {
  const { t } = useLingui();
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="shrink-0 whitespace-nowrap ui-text-label-strong ui-color-primary">
            {label}
          </span>
          <span className="min-w-0 ui-text-meta ui-color-disabled">
            {description}
          </span>
        </div>
        <AppPermissionStatus granted={granted} />
      </div>
      <button
        type="button"
        onClick={() => void onRequest()}
        className="mt-1.5 ui-text-meta ui-color-muted transition-colors hover:text-content-secondary"
      >
        {t({ id: "settings.app.open_settings", message: "Open Settings" })}
      </button>
    </div>
  );
}

function PrivacyToggle({
  label,
  description,
  enabled,
  onToggle,
  ariaLabel,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="rounded-lg bg-surface-surface p-2.5">
      <div className="px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="ui-text-label-strong ui-color-primary">{label}</span>
          <ToggleSwitch
            enabled={enabled}
            onToggle={onToggle}
            ariaLabel={ariaLabel}
          />
        </div>
        <span className="mt-0.5 block ui-text-micro ui-color-disabled">
          {description}
        </span>
      </div>
    </div>
  );
}

async function requestAccessibility() {
  try {
    if (!(await requestMacAccessibilityPermission())) {
      await openAccessibilitySettings();
    }
  } catch {
    await openAccessibilitySettings();
  }
}

async function requestInputMonitoring() {
  try {
    await requestMacInputMonitoringPermission();
    if (!(await checkMacInputMonitoringPermission())) {
      await openInputMonitoringSettings();
    }
  } catch {
    await openInputMonitoringSettings();
  }
}
