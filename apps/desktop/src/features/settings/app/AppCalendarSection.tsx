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
          message: "Meeting awareness",
        })}
      </SectionLabel>
      {props.platformCapabilities.id === "macos" ? (
        <div className="rounded-lg bg-surface-surface p-2.5">
          <div className="flex items-center justify-between gap-3 px-2 py-1.5">
            <div className="min-w-0">
              <span className="block ui-text-label-strong ui-color-primary">
                {t({
                  id: "settings.app.meeting_awareness.label",
                  message: "Calendar reminders",
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
                        "Use local Calendar events to suggest recording when a meeting starts. Recording still requires your click.",
                    })}
              </span>
            </div>
            <ToggleSwitch
              enabled={props.calendarMeetingAwarenessEnabled}
              disabled={controls.calendarBusy}
              onToggle={() => void controls.toggleCalendarAwareness()}
              ariaLabel={t({
                id: "settings.app.meeting_awareness.toggle_aria",
                message: "Toggle calendar meeting reminders",
              })}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border-primary px-2 pt-3 pb-1.5">
            <div className="min-w-0">
              <span className="block ui-text-label-strong ui-color-primary">
                {t({
                  id: "settings.app.microphone_awareness.label",
                  message: "Microphone activity suggestions",
                })}
              </span>
              <span className="mt-0.5 block ui-text-micro ui-color-disabled">
                {t({
                  id: "settings.app.microphone_awareness.body",
                  message:
                    "Suggest recording when another app starts using your microphone. Looper reads only the system in-use signal and never listens until you click Record.",
                })}
              </span>
            </div>
            <ToggleSwitch
              enabled={props.microphoneMeetingAwarenessEnabled}
              onToggle={() =>
                props.onMicrophoneMeetingAwarenessEnabledChange(
                  !props.microphoneMeetingAwarenessEnabled,
                )
              }
              ariaLabel={t({
                id: "settings.app.microphone_awareness.toggle_aria",
                message: "Toggle microphone activity suggestions",
              })}
            />
          </div>
        </div>
      ) : (
        <p className="px-2 py-1.5 ui-text-meta ui-color-muted">
          {t({
            id: "settings.app.meeting_awareness.unsupported",
            message: "Meeting awareness is currently available on macOS.",
          })}
        </p>
      )}

      <SectionLabel>
        {t({
          id: "settings.app.meeting_defaults",
          message: "Meeting recording",
        })}
      </SectionLabel>
      <div className="rounded-lg bg-surface-surface p-2.5">
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div className="min-w-0">
            <span className="block ui-text-label-strong ui-color-primary">
              {t({
                id: "settings.app.meeting_system_audio.label",
                message: "System audio",
              })}
            </span>
            <span className="mt-0.5 block ui-text-micro ui-color-disabled">
              {t({
                id: "settings.app.meeting_system_audio.body",
                message:
                  "Include the people and media you hear through this computer.",
              })}
            </span>
          </div>
          <ToggleSwitch
            enabled={props.meetingSystemAudioEnabled}
            onToggle={() =>
              props.onMeetingSystemAudioEnabledChange(
                !props.meetingSystemAudioEnabled,
              )
            }
            ariaLabel={t({
              id: "settings.app.meeting_system_audio.toggle_aria",
              message: "Toggle system audio for new meetings",
            })}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border-primary px-2 pt-3 pb-1.5">
          <div className="min-w-0">
            <span className="block ui-text-label-strong ui-color-primary">
              {t({
                id: "settings.app.meeting_live_transcript.label",
                message: "Live transcript",
              })}
            </span>
            <span className="mt-0.5 block ui-text-micro ui-color-disabled">
              {t({
                id: "settings.app.meeting_live_transcript.body",
                message:
                  "Show live captions when a compatible local model is installed.",
              })}
            </span>
          </div>
          <ToggleSwitch
            enabled={props.meetingLiveTranscriptEnabled}
            onToggle={() =>
              props.onMeetingLiveTranscriptEnabledChange(
                !props.meetingLiveTranscriptEnabled,
              )
            }
            ariaLabel={t({
              id: "settings.app.meeting_live_transcript.toggle_aria",
              message: "Toggle live transcript for new meetings",
            })}
          />
        </div>

        <p className="border-t border-border-primary px-2 pt-3 pb-1.5 ui-text-micro ui-color-disabled">
          {t({
            id: "settings.app.meeting_defaults.model",
            message: "Choose the transcription model in Processing & Models.",
          })}
        </p>
      </div>
    </section>
  );
}
