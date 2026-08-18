import { useTranslation } from "@looper/i18n/react";
import {
  IconCheck,
  IconChevronDown,
  IconMicrophone,
  IconPlayerStop,
  IconX,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { type AudioRecorderResult, useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useMicrophoneDevices } from "@/hooks/use-microphone-devices";
import { cn } from "@/lib/cn";
import { Menu, MenuContent, MenuItem, MenuTrigger, Tooltip } from "@/shared/components/ui";

interface AudioRecorderProps {
  onRecordingComplete: (result: AudioRecorderResult) => void;
  disabled?: boolean;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AudioRecorderButton({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const { t } = useTranslation();
  const recorder = useAudioRecorder({ maxDurationMs: 120_000 });
  const mics = useMicrophoneDevices();

  const handleToggle = async () => {
    if (recorder.isRecording) {
      const result = await recorder.stop();
      if (result) onRecordingComplete(result);
    } else {
      await recorder.start(mics.selectedId ?? undefined);
    }
  };

  if (recorder.isRecording) {
    return (
      <div className="flex items-center gap-2">
        <LiveWaveform level={recorder.audioLevel} />
        <span className="text-primary text-xs tabular-nums">
          {formatDuration(recorder.durationMs)}
        </span>
        <Tooltip label={t("common.cancel")}>
          <button
            type="button"
            onClick={() => recorder.cancel()}
            className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label={t("common.cancel")}
          >
            <IconX className="size-3.5" />
          </button>
        </Tooltip>
        <Tooltip label={t("recorder.stopRecording")}>
          <button
            type="button"
            onClick={handleToggle}
            className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label={t("recorder.stopRecording")}
          >
            <IconPlayerStop className="size-4" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="relative flex items-center">
      <Tooltip label={t("recorder.recordVoice")}>
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label={t("recorder.recordVoice")}
        >
          <IconMicrophone className="size-4" />
        </button>
      </Tooltip>

      {mics.devices.length > 1 && (
        <Menu>
          <MenuTrigger
            aria-label={t("recorder.selectMic")}
            className="grid size-5 place-items-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconChevronDown className="size-3" />
          </MenuTrigger>
          <MenuContent side="top" align="end" className="w-56">
            {mics.devices.map((d) => (
              <MenuItem
                key={d.deviceId}
                onClick={() => mics.select(d.deviceId)}
                className={cn(
                  "justify-between text-xs",
                  mics.selectedId === d.deviceId && "text-primary",
                )}
              >
                {d.label}
                {mics.selectedId === d.deviceId ? <IconCheck className="size-3.5" /> : null}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
    </div>
  );
}

function LiveWaveform({ level }: { level: number }) {
  const bars = useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => {
      const center = Math.abs(i - Math.floor(count / 2));
      const scale = 1 - center * 0.15;
      return Math.max(0.15, level * scale);
    });
  }, [level]);

  return (
    <div className="flex h-6 items-center gap-[3px]">
      {bars.map((h, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: audio visualization bars, order never changes
          key={i}
          className="w-[3px] rounded-full bg-primary transition-all duration-75"
          style={{ height: `${Math.max(4, h * 24)}px` }}
        />
      ))}
    </div>
  );
}
