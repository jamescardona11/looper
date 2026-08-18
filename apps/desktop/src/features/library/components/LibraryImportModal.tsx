import { useLingui } from "@lingui/react/macro";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { LibraryImportOptions, SpeechModel } from "../../../types";
import { useShiftHeld } from "../../../shared/hooks/useShiftHeld";
import { SUPPORTED_EXTENSIONS, uniquePaths } from "./library-utils";
import { FileImportActions } from "./library-import-file-actions";
import { FileImportOptions } from "./library-import-file-options";
import {
  ImportFileList,
  importFileMetadata,
  importFileName,
} from "./library-import-files";
import { FileImportHeading } from "./library-import-headings";
import { LibraryImportModalFrame } from "./library-import-modal-frame";
import { ImportModelWarning } from "./library-import-model-warning";
import {
  constrainFilePreferences,
  fileImportOptions,
  importModelOptions,
  importModelSupport,
  initialModelKey,
  type ImportPreferences,
} from "./library-import-policy";
import { useLibraryImportProbes } from "./library-import-probe-query";

type LibraryImportModalProps = {
  paths: string[];
  models: SpeechModel[];
  defaultModelKey?: string;
  onCancel: () => void;
  onConfirm: (
    paths: string[],
    options: LibraryImportOptions,
  ) => Promise<void> | void;
};

const initialPreferences: ImportPreferences = {
  storeOriginal: true,
  denoiseEnabled: false,
  showTimestamps: true,
  detectSpeakers: false,
};

const LibraryImportModal = ({
  paths,
  models,
  defaultModelKey,
  onCancel,
  onConfirm,
}: LibraryImportModalProps) => {
  const { t } = useLingui();
  const [selectedPaths, setSelectedPaths] = useState(paths);
  const [fileListVisible, revealFileList] = useState(paths.length > 1);
  const [selectedModelKey, setSelectedModelKey] = useState(() =>
    initialModelKey(models, defaultModelKey),
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [submissionPending, setSubmissionPending] = useState(false);
  const shiftHeld = useShiftHeld();
  const probes = useLibraryImportProbes(selectedPaths);
  const resolvedModelKey = selectedModelKey || models[0]?.id || "";
  if (resolvedModelKey !== selectedModelKey) {
    setSelectedModelKey(resolvedModelKey);
  }
  const support = importModelSupport(models, resolvedModelKey);
  const settledPreferences = constrainFilePreferences(preferences, support);
  if (settledPreferences !== preferences) setPreferences(settledPreferences);

  const modelOptions = importModelOptions(
    models,
    t({
      id: "library.import.remote_provider",
      message: "Remote provider",
    }),
  );
  const singleMeta =
    selectedPaths.length === 1
      ? importFileMetadata(selectedPaths[0], probes)
      : "";
  const headingSummary =
    selectedPaths.length === 1
      ? [importFileName(selectedPaths[0]), singleMeta]
          .filter(Boolean)
          .join(" · ")
      : t({
          id: "library.import.summary.multiple",
          message: `${selectedPaths.length} files`,
        });

  const changeModel = (modelKey: string) => {
    setSelectedModelKey(modelKey);
    setPreferences((current) =>
      constrainFilePreferences(current, importModelSupport(models, modelKey)),
    );
  };

  const addFiles = async () => {
    try {
      const selection = await open({
        multiple: true,
        filters: [
          {
            name: t({
              id: "library.view.file_filter",
              message: "Audio & Video",
            }),
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selection) return;
      const chosenPaths = Array.isArray(selection) ? selection : [selection];
      const next = uniquePaths([...selectedPaths, ...chosenPaths]);
      setSelectedPaths(next);
      if (next.length > 1) revealFileList(true);
    } catch (error) {
      console.error("Failed to open add files dialog:", error);
    }
  };

  const confirm = async () => {
    if (!selectedModelKey) return;
    setSubmissionPending(true);
    try {
      await onConfirm(
        selectedPaths,
        fileImportOptions(selectedModelKey, settledPreferences, support),
      );
    } finally {
      setSubmissionPending(false);
    }
  };

  return (
    <LibraryImportModalFrame panelWidth="440" onCancel={onCancel}>
      <FileImportHeading summary={headingSummary} onCancel={onCancel} />
      <div className="flex flex-col gap-5 px-5 py-5">
        {modelOptions.length === 0 && <ImportModelWarning />}
        {fileListVisible && (
          <ImportFileList
            paths={selectedPaths}
            probes={probes}
            shiftHeld={shiftHeld}
            onRemove={(index) =>
              setSelectedPaths((current) =>
                current.filter((_, currentIndex) => currentIndex !== index),
              )
            }
          />
        )}
        <FileImportOptions
          modelOptions={modelOptions}
          selectedModelKey={resolvedModelKey}
          preferences={settledPreferences}
          support={support}
          onModelChange={changeModel}
          onPreferencesChange={setPreferences}
        />
      </div>
      <FileImportActions
        isImporting={submissionPending}
        canConfirm={
          !submissionPending &&
          selectedPaths.length > 0 &&
          Boolean(resolvedModelKey)
        }
        onAddFiles={() => void addFiles()}
        onCancel={onCancel}
        onConfirm={() => void confirm()}
      />
    </LibraryImportModalFrame>
  );
};

export default LibraryImportModal;
