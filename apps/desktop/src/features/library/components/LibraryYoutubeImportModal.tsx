import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { probeLibraryYoutubeUrl } from "../../../data/library";
import type {
  LibraryImportOptions,
  SpeechModel,
  YoutubeImportMetadata,
} from "../../../types";
import { YoutubeImportActions } from "./library-youtube-actions";
import { YoutubeImportHeading } from "./library-import-headings";
import { LibraryImportModalFrame } from "./library-import-modal-frame";
import {
  importModelOptions,
  importModelSupport,
  initialModelKey,
  youtubeImportOptions,
  type ImportPreferences,
} from "./library-import-policy";
import { YoutubeImportOptions } from "./library-youtube-options";
import { YoutubeSource } from "./library-youtube-source";

type LibraryYoutubeImportModalProps = {
  models: SpeechModel[];
  defaultModelKey?: string;
  onCancel: () => void;
  onConfirm: (
    metadata: YoutubeImportMetadata,
    options: LibraryImportOptions,
  ) => Promise<void>;
};

const initialPreferences: ImportPreferences = {
  storeOriginal: true,
  denoiseEnabled: false,
  showTimestamps: true,
  detectSpeakers: false,
};

const LibraryYoutubeImportModal = ({
  models,
  defaultModelKey,
  onCancel,
  onConfirm,
}: LibraryYoutubeImportModalProps) => {
  const { t } = useLingui();
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState<YoutubeImportMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState(() =>
    initialModelKey(models, defaultModelKey),
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const resolvedModelKey = selectedModelKey || models[0]?.id || "";
  if (resolvedModelKey !== selectedModelKey) {
    setSelectedModelKey(resolvedModelKey);
  }
  const support = importModelSupport(models, resolvedModelKey);
  const modelOptions = importModelOptions(
    models,
    t({
      id: "library.import.remote_provider",
      message: "Remote provider",
    }),
  );

  const changeUrl = (next: string) => {
    setUrl(next);
    setMetadata(null);
    setError(null);
  };

  const probe = async () => {
    if (!url.trim()) return;
    setIsProbing(true);
    setError(null);
    try {
      setMetadata(await probeLibraryYoutubeUrl(url));
    } catch (cause) {
      setMetadata(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsProbing(false);
    }
  };

  const confirm = async () => {
    if (!metadata || !selectedModelKey) return;
    setIsImporting(true);
    setError(null);
    try {
      await onConfirm(
        metadata,
        youtubeImportOptions(selectedModelKey, preferences, support),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setIsImporting(false);
    }
  };

  return (
    <LibraryImportModalFrame
      panelWidth="460"
      onCancel={onCancel}
      labelledBy="youtube-import-title"
    >
      <YoutubeImportHeading onCancel={onCancel} />
      <div className="flex flex-col gap-4 px-5 py-5">
        <YoutubeSource
          url={url}
          metadata={metadata}
          isProbing={isProbing}
          onUrlChange={changeUrl}
          onProbe={() => void probe()}
        />
        {metadata && (
          <YoutubeImportOptions
            modelOptions={modelOptions}
            selectedModelKey={resolvedModelKey}
            preferences={preferences}
            support={support}
            onModelChange={setSelectedModelKey}
            onPreferencesChange={setPreferences}
          />
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 ui-text-body-sm ui-color-error-tint"
          >
            {error}
          </div>
        )}
      </div>
      <YoutubeImportActions
        isImporting={isImporting}
        canConfirm={Boolean(metadata && resolvedModelKey && !isImporting)}
        onCancel={onCancel}
        onConfirm={() => void confirm()}
      />
    </LibraryImportModalFrame>
  );
};

export default LibraryYoutubeImportModal;
