import { useTranscribe } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { useRef, useState } from "react";
import { reportError } from "@/lib/errors";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import { VoiceToolNav } from "@/shared/components/voice-tool-nav";
import { TranscribeControls } from "./components/transcribe-controls";
import { TranscriptWorkspace } from "./components/transcript-workspace";
import { TranscriptionHistory } from "./components/transcription-history";
import type { TranscriptionMode, TranscriptionProvider } from "./transcribe-types";
import { useStreamingStt } from "./use-streaming-stt";

export function TranscribePage() {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<TranscriptionProvider>("deepgram");
  const [mode, setMode] = useState<TranscriptionMode>("file");
  const [isDragging, setIsDragging] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedTranscriptionId, setCopiedTranscriptionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { transcribe, history, isAvailable } = useTranscribe();
  const live = useStreamingStt(provider);
  const latestTranscription = history[0];
  const previousTranscriptions = history.slice(1);
  const showTranscriptFirst = mode === "file" && Boolean(latestTranscription);

  async function transcribeBlob(blob: Blob, contentType: string, durationMs?: number) {
    await transcribe({ blob, type: contentType, provider, durationMs });
  }

  async function transcribeSelectedFile() {
    if (!selectedFile || !isAvailable) return;
    setIsTranscribing(true);
    setError(null);
    try {
      await transcribeBlob(selectedFile, selectedFile.type || "audio/mpeg");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (transcriptionError) {
      setError(reportError(transcriptionError, t("transcribe.failed")));
    } finally {
      setIsTranscribing(false);
    }
  }

  async function transcribeRecording(result: {
    uri: string;
    mimeType: string;
    durationMs: number;
  }) {
    if (!isAvailable) return;
    setIsTranscribing(true);
    setError(null);
    try {
      const response = await fetch(result.uri);
      const blob = await response.blob();
      await transcribeBlob(blob, result.mimeType, result.durationMs);
    } catch (transcriptionError) {
      setError(reportError(transcriptionError, t("transcribe.failed")));
    } finally {
      setIsTranscribing(false);
    }
  }

  function copyTranscription(id: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedTranscriptionId(id);
      window.setTimeout(() => setCopiedTranscriptionId(null), 2_000);
    });
  }

  return (
    <ProductPageLayout>
      <ProductPageHeader
        eyebrow={t("nav.voiceTools")}
        title={t("transcribe.title")}
        description={t("transcribe.subtitle")}
      >
        <VoiceToolNav />
      </ProductPageHeader>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <TranscriptWorkspace
          mode={mode}
          provider={provider}
          live={live}
          latestTranscription={latestTranscription}
          copiedTranscriptionId={copiedTranscriptionId}
          showFirst={showTranscriptFirst}
          onCopy={copyTranscription}
        />
        <TranscribeControls
          mode={mode}
          provider={provider}
          live={live}
          showAfterWorkspace={showTranscriptFirst}
          isAvailable={isAvailable}
          selectedFile={selectedFile}
          isDragging={isDragging}
          isTranscribing={isTranscribing}
          error={error}
          fileInputRef={fileInputRef}
          onModeChange={setMode}
          onProviderChange={setProvider}
          onFileSelect={setSelectedFile}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) setSelectedFile(file);
          }}
          onDraggingChange={setIsDragging}
          onRecordingComplete={(result) => void transcribeRecording(result)}
          onTranscribe={() => void transcribeSelectedFile()}
        />
      </div>

      <TranscriptionHistory
        transcriptions={previousTranscriptions}
        copiedTranscriptionId={copiedTranscriptionId}
        onCopy={copyTranscription}
      />
    </ProductPageLayout>
  );
}
