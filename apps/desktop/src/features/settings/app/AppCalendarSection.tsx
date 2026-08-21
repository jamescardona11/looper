import { useLingui } from "@lingui/react/macro";
import SectionLabel from "../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import type { AppCalendarProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import type { AppTabControls } from "./useAppTabControls";

export function AppCalendarSection({
  controls,
  ...props
}: AppCalendarProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  if (!isAppSectionVisible(props.activeSection, "calendar")) return null;

  return (
    <section data-settings-section="calendar" className="space-y-2">
      <SectionLabel>
        {t({
          id: "settings.app.meeting_awareness",
          message: "Calendar meetings",
        })}
      </SectionLabel>
      <div className="rounded-lg bg-surface-surface p-2.5">
        {props.platformCapabilities.id === "macos" ? (
          <div className="flex items-center justify-between gap-3 px-2 py-1.5">
            <div className="min-w-0">
              <span className="block ui-text-label-strong ui-color-primary">
                {t({
                  id: "settings.app.meeting_awareness.label",
                  message: "Meeting notifications",
                })}
              </span>
              <span className="mt-0.5 block ui-text-micro ui-color-disabled">
                {controls.calendarAccess === "denied"
                  ? t({
                      id: "settings.app.meeting_awareness.denied",
                      message:
                        "Calendar access is off. Enable it in macOS Privacy settings and try again.",
                    })
                  : t({
                      id: "settings.app.meeting_awareness.body",
                      message:
                        "Looper notifies you when a calendar meeting starts or another app is using your microphone. Recording still requires your click.",
                    })}
              </span>
            </div>
            <ToggleSwitch
              enabled={props.calendarMeetingAwarenessEnabled}
              disabled={controls.calendarBusy}
              onToggle={() => void controls.toggleCalendarAwareness()}
              ariaLabel={t({
                id: "settings.app.meeting_awareness.toggle_aria",
                message: "Toggle meeting notifications",
              })}
            />
          </div>
        ) : (
          <p className="px-2 py-1.5 ui-text-meta ui-color-muted">
            {t({
              id: "settings.app.meeting_awareness.unsupported",
              message:
                "Meeting notifications are currently available on macOS.",
            })}
          </p>
        )}
      </div>
    </section>
  );
}
