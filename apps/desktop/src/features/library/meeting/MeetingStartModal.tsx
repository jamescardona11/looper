import { useLingui } from "@lingui/react/macro";
import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowSquareOut as ExternalLink,
  DeviceMobile,
  Microphone,
  SpeakerHigh,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Dropdown, type DropdownOption } from "../../../shared/ui/Dropdown";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import type { MeetingStartOptions, SpeechModel } from "../../../types";
import {
  isLiveMeetingSharingEnabled,
  setLiveMeetingSharingEnabled,
} from "../../../data/live-meeting";

type MeetingStartModalProps = {
  models: SpeechModel[];
  liveModels: SpeechModel[];
  defaultModelKey?: string;
  isStarting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (options: MeetingStartOptions) => Promise<void> | void;
  onOpenMicrophoneSettings: () => Promise<void> | void;
  onOpenSystemAudioSettings: () => Promise<void> | void;
};

const MeetingStartModal = ({
  models,
  liveModels,
  defaultModelKey,
  isStarting,
  error,
  onCancel,
  onConfirm,
  onOpenMicrophoneSettings,
  onOpenSystemAudioSettings,
}: MeetingStartModalProps) => {
  const { t } = useLingui();
  const initialModelKey =
    models.find((model) => model.id === defaultModelKey)?.id ??
    models[0]?.id ??
    "";
  const [modelKey, setModelKey] = useState(initialModelKey);
  const [liveTranscriptEnabled, setLiveTranscriptEnabled] = useState(
    liveModels.length > 0,
  );
  const [liveModelKey, setLiveModelKey] = useState(liveModels[0]?.id ?? "");
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [shareLiveTranscript, setShareLiveTranscript] = useState(
    isLiveMeetingSharingEnabled,
  );
  const permissionSettingsAction = error?.includes(
    "Microphone access is required",
  )
    ? {
        label: t({
          id: "meeting.start.open_microphone_settings",
          message: "Open Microphone Settings",
        }),
        onClick: onOpenMicrophoneSettings,
      }
    : error?.includes("Screen & System Audio Recording")
      ? {
          label: t({
            id: "meeting.start.open_system_audio_settings",
            message: "Open System Settings",
          }),
          onClick: onOpenSystemAudioSettings,
        }
      : null;
  const modelOptions: DropdownOption<string>[] = models.map((model) => ({
    value: model.id,
    label: model.label,
    description: model.remote
      ? t({ id: "meeting.start.remote", message: "Remote provider" })
      : model.description,
  }));
  const liveModelOptions: DropdownOption<string>[] = liveModels.map(
    (model) => ({
      value: model.id,
      label: model.label,
      description: model.description,
    }),
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-6 backdrop-blur-xs"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-[440px] max-w-[92vw] rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep"
        onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4">
          <div>
            <h2 className="ui-text-body-lg font-semibold text-content-primary">
              {t({ id: "meeting.start.title", message: "Record meeting" })}
            </h2>
            <p className="mt-1 ui-text-meta text-content-muted">
              {t({
                id: "meeting.start.description",
                message:
                  "Capture your microphone and the audio playing on this computer.",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isStarting}
            className="ml-3 flex h-7 w-7 items-center justify-center rounded-md text-content-muted hover:bg-surface-elevated hover:text-content-primary disabled:opacity-50"
            aria-label={t({ id: "meeting.start.close", message: "Close" })}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {models.length === 0 ? (
            <div className="flex items-start gap-2 ui-text-body-sm ui-color-warning-strong">
              <Warning size={15} className="mt-0.5 shrink-0" />
              <span>
                {t({
                  id: "meeting.start.no_models",
                  message:
                    "Install a local transcription model or configure a remote speech provider before recording.",
                })}
              </span>
            </div>
          ) : (
            <div>
              <label className="ui-text-label text-content-muted">
                {t({
                  id: "meeting.start.model",
                  message: "Transcription model",
                })}
              </label>
              <Dropdown
                value={modelKey}
                options={modelOptions}
                onChange={setModelKey}
                className="mt-2"
              />
            </div>
          )}

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border-primary bg-surface-secondary px-3.5 py-3">
            <div className="flex min-w-0 gap-3">
              <SpeakerHigh
                size={17}
                className="mt-0.5 shrink-0 text-content-muted"
              />
              <div>
                <p className="ui-text-body-sm font-medium text-content-primary">
                  {t({
                    id: "meeting.start.system_audio",
                    message: "System audio",
                  })}
                </p>
                <p className="mt-0.5 ui-text-meta text-content-muted">
                  {t({
                    id: "meeting.start.system_audio_help",
                    message:
                      "Include the people and media you hear through this computer.",
                  })}
                </p>
              </div>
            </div>
            <ToggleSwitch
              enabled={systemAudioEnabled}
              onToggle={() => setSystemAudioEnabled((enabled) => !enabled)}
              ariaLabel={t({
                id: "meeting.start.system_audio",
                message: "System audio",
              })}
              size="md"
            />
          </div>

          {liveModels.length > 0 && (
            <div className="rounded-xl border border-border-primary bg-surface-secondary px-3.5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="ui-text-body-sm font-medium text-content-primary">
                    {t({
                      id: "meeting.start.live_transcript",
                      message: "Live transcript",
                    })}
                  </p>
                  <p className="mt-0.5 ui-text-meta text-content-muted">
                    {t({
                      id: "meeting.start.live_transcript_help",
                      message:
                        "Show the local transcript inside the meeting pill, labeled You and Them after each pause.",
                    })}
                  </p>
                </div>
                <ToggleSwitch
                  enabled={liveTranscriptEnabled}
                  onToggle={() => {
                    setLiveTranscriptEnabled((enabled) => {
                      const next = !enabled;
                      if (!next) {
                        setShareLiveTranscript(false);
                        setLiveMeetingSharingEnabled(false);
                      }
                      return next;
                    });
                  }}
                  ariaLabel={t({
                    id: "meeting.start.live_transcript",
                    message: "Live transcript",
                  })}
                  size="md"
                />
              </div>
              {liveTranscriptEnabled && liveModelOptions.length > 0 && (
                <Dropdown
                  value={liveModelKey}
                  options={liveModelOptions}
                  onChange={setLiveModelKey}
                  className="mt-3"
                />
              )}
            </div>
          )}

          {liveModels.length > 0 && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border-primary bg-surface-secondary px-3.5 py-3">
              <div className="flex min-w-0 gap-3">
                <DeviceMobile
                  size={17}
                  className="mt-0.5 shrink-0 text-content-muted"
                />
                <div>
                  <p className="ui-text-body-sm font-medium text-content-primary">
                    {t({
                      id: "meeting.start.mobile_companion",
                      message: "Mobile companion",
                    })}
                  </p>
                  <p className="mt-0.5 ui-text-meta text-content-muted">
                    {t({
                      id: "meeting.start.mobile_companion_help",
                      message:
                        "Share transcript text with your signed-in mobile devices. Audio stays on this computer.",
                    })}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={shareLiveTranscript && liveTranscriptEnabled}
                onToggle={() => {
                  const enabled = !(
                    shareLiveTranscript && liveTranscriptEnabled
                  );
                  setShareLiveTranscript(enabled);
                  setLiveMeetingSharingEnabled(enabled);
                  if (enabled) setLiveTranscriptEnabled(true);
                }}
                ariaLabel={t({
                  id: "meeting.start.mobile_companion",
                  message: "Mobile companion",
                })}
                size="md"
              />
            </div>
          )}

          <div className="flex items-start gap-2 ui-text-meta text-content-muted">
            <Microphone size={14} className="mt-0.5 shrink-0" />
            <span>
              {t({
                id: "meeting.start.permission",
                message:
                  "Looper will request microphone and system audio permission when needed.",
              })}
            </span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 ui-text-meta ui-color-error-tint">
              <p>{error}</p>
              {permissionSettingsAction && (
                <button
                  type="button"
                  onClick={permissionSettingsAction.onClick}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-2 py-1 font-medium hover:bg-red-500/10"
                >
                  <ExternalLink size={13} />
                  {permissionSettingsAction.label}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-primary px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isStarting}
            className="rounded-lg px-3 py-1.5 ui-text-body-sm text-content-secondary hover:bg-surface-elevated hover:text-content-primary disabled:opacity-50"
          >
            {t({ id: "common.cancel", message: "Cancel" })}
          </button>
          <button
            type="button"
            disabled={!modelKey || isStarting}
            onClick={() => {
              return onConfirm({
                model_key: modelKey,
                live_model_key:
                  liveTranscriptEnabled && liveModelKey ? liveModelKey : null,
                system_audio_enabled: systemAudioEnabled,
              });
            }}
            className="rounded-lg bg-content-primary px-3.5 py-1.5 ui-text-body-sm font-medium text-surface-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting
              ? t({ id: "meeting.start.starting", message: "Starting..." })
              : t({ id: "meeting.start.confirm", message: "Start recording" })}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default MeetingStartModal;
