import { useTranslation } from "@looper/i18n/react";
import {
  IconFileUpload,
  IconLoader2,
  IconMicrophone,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { AudioRecorderButton } from "@/shared/components/audio-recorder";
import { Eyebrow } from "@/shared/components/eyebrow";
import { ToolSetupNotice } from "@/shared/components/tool-setup-notice";
import { Button, Card, Select, ToggleGroup } from "@/shared/components/ui";
import {
  TRANSCRIPTION_PROVIDER_LABELS,
  type TranscriptionMode,
  type TranscriptionProvider,
} from "../transcribe-types";
import type { useStreamingStt } from "../use-streaming-stt";

export function TranscribeControls({
  mode,
  provider,
  live,
  isAvailable,
  selectedFile,
  isDragging,
  isTranscribing,
  error,
  fileInputRef,
  showAfterWorkspace,
  onModeChange,
  onProviderChange,
  onFileSelect,
  onDrop,
  onDraggingChange,
  onRecordingComplete,
  onTranscribe,
}: {
  mode: TranscriptionMode;
  provider: TranscriptionProvider;
  live: ReturnType<typeof useStreamingStt>;
  isAvailable: boolean;
  selectedFile: File | null;
  isDragging: boolean;
  isTranscribing: boolean;
  error: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showAfterWorkspace: boolean;
  onModeChange: (mode: TranscriptionMode) => void;
  onProviderChange: (provider: TranscriptionProvider) => void;
  onFileSelect: (file: File) => void;
  onDrop: (event: React.DragEvent) => void;
  onDraggingChange: (isDragging: boolean) => void;
  onRecordingComplete: (result: { uri: string; mimeType: string; durationMs: number }) => void;
  onTranscribe: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        "p-5 md:sticky md:top-8 md:order-2",
        showAfterWorkspace ? "order-2" : "order-1",
      )}
    >
      <div>
        <Eyebrow>{t("transcribe.source")}</Eyebrow>
        <p className="mt-1 text-muted-foreground text-xs">{t("transcribe.sourceHint")}</p>
      </div>

      <ToggleGroup
        aria-label={t("transcribe.title")}
        value={mode}
        onValueChange={(value) => onModeChange(value as TranscriptionMode)}
        size="sm"
        className="mt-5 w-full"
        items={[
          { value: "file", label: t("transcribe.modeFile") },
          { value: "live", label: t("transcribe.modeLive") },
        ]}
      />

      {!isAvailable ? (
        <div className="mt-4">
          <ToolSetupNotice />
        </div>
      ) : null}

      {mode === "live" ? (
        <LiveTranscribeControls
          live={live}
          provider={provider}
          onProviderChange={onProviderChange}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <button
            type="button"
            onDragOver={(event) => {
              event.preventDefault();
              onDraggingChange(true);
            }}
            onDragLeave={() => onDraggingChange(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground"
            }`}
          >
            <IconFileUpload className="size-7 text-muted-foreground" aria-hidden />
            {selectedFile ? (
              <p className="max-w-full truncate font-medium text-foreground text-sm">
                {selectedFile.name}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("transcribe.dropAudioHint")}{" "}
                <span className="text-primary">{t("transcribe.dropAudioClick")}</span>
              </p>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            aria-label={t("transcribe.dropAudioClick")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelect(file);
            }}
          />

          <ProviderSelect provider={provider} onProviderChange={onProviderChange} />

          <div className="flex items-center gap-2">
            <AudioRecorderButton
              onRecordingComplete={onRecordingComplete}
              disabled={isTranscribing}
            />
            <Button
              type="button"
              onClick={onTranscribe}
              disabled={!selectedFile || isTranscribing || !isAvailable}
              className="flex-1"
            >
              {isTranscribing ? (
                <IconLoader2
                  className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <IconFileUpload className="size-4" aria-hidden />
              )}
              {isTranscribing ? t("transcribe.transcribing") : t("transcribe.transcribe")}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function LiveTranscribeControls({
  live,
  provider,
  onProviderChange,
}: {
  live: ReturnType<typeof useStreamingStt>;
  provider: TranscriptionProvider;
  onProviderChange: (provider: TranscriptionProvider) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex flex-col gap-4">
      <ProviderSelect provider={provider} onProviderChange={onProviderChange} />

      <div className="rounded-xl border border-border bg-secondary/15 p-3">
        {live.isLive ? (
          <span className="flex items-center gap-2 text-primary text-sm">
            <span
              className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
              aria-hidden
            />
            {t("transcribe.liveListening")}
          </span>
        ) : (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("transcribe.liveHint")}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant={live.isLive ? "destructive" : "primary"}
        onClick={() => (live.isLive ? void live.stop() : void live.start())}
        disabled={live.status === "connecting"}
        className="w-full"
      >
        {live.status === "connecting" ? (
          <>
            <IconLoader2
              className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            {t("transcribe.liveConnecting")}
          </>
        ) : live.isLive ? (
          <>
            <IconPlayerStopFilled className="size-4" aria-hidden />
            {t("transcribe.liveStop")}
          </>
        ) : (
          <>
            <IconMicrophone className="size-4" aria-hidden />
            {t("transcribe.liveStart")}
          </>
        )}
      </Button>

      {live.error ? (
        <p role="alert" className="text-destructive text-sm">
          {live.error}
        </p>
      ) : null}
    </div>
  );
}

function ProviderSelect({
  provider,
  onProviderChange,
}: {
  provider: TranscriptionProvider;
  onProviderChange: (provider: TranscriptionProvider) => void;
}) {
  const { t } = useTranslation();
  const providers = Object.keys(TRANSCRIPTION_PROVIDER_LABELS) as TranscriptionProvider[];

  return (
    <Select
      aria-label={t("transcribe.title")}
      value={provider}
      onValueChange={(value) => onProviderChange(value as TranscriptionProvider)}
      className="w-full"
      items={providers.map((value) => ({
        value,
        label: TRANSCRIPTION_PROVIDER_LABELS[value],
      }))}
    />
  );
}
