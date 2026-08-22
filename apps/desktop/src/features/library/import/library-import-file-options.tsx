import { useLingui } from "@lingui/react/macro";
import type { DropdownOption } from "../../../shared/ui/Dropdown";
import type {
  ImportModelSupport,
  ImportPreferences,
} from "./library-import-policy";
import { ImportModelPicker, ImportToggleRow } from "./library-import-controls";

type FileImportOptionsProps = {
  modelOptions: DropdownOption<string>[];
  selectedModelKey: string;
  preferences: ImportPreferences;
  support: ImportModelSupport;
  onModelChange: (modelKey: string) => void;
  onPreferencesChange: (preferences: ImportPreferences) => void;
};

export const FileImportOptions = ({
  modelOptions: availableModels,
  selectedModelKey,
  preferences,
  support,
  onModelChange,
  onPreferencesChange,
}: FileImportOptionsProps) => {
  const { t } = useLingui();
  const change = (patch: Partial<ImportPreferences>) =>
    onPreferencesChange({ ...preferences, ...patch });

  return (
    <>
      <ImportModelPicker
        value={selectedModelKey}
        options={availableModels}
        onChange={onModelChange}
        fileSearchCopy
      />
      <ImportToggleRow
        layout="file"
        title={t({
          id: "library.import.store_original",
          message: "Store original file",
        })}
        description={t({
          id: "library.import.store_original.description",
          message: "Keep a copy inside the library folder",
        })}
        enabled={preferences.storeOriginal}
        onToggle={() => change({ storeOriginal: !preferences.storeOriginal })}
        ariaLabel={t({
          id: "library.import.store_original.aria",
          message: "Store original",
        })}
      />
      <ImportToggleRow
        layout="file"
        title={t({
          id: "library.import.denoise",
          message: "Reduce background noise",
        })}
        description={t({
          id: "library.import.denoise.description",
          message:
            "Apply conservative local FFT denoising before transcription",
        })}
        enabled={preferences.denoiseEnabled}
        onToggle={() => change({ denoiseEnabled: !preferences.denoiseEnabled })}
        ariaLabel={t({
          id: "library.import.denoise.aria",
          message: "Reduce background noise",
        })}
      />
      <ImportToggleRow
        layout="file"
        title={t({
          id: "library.import.show_timestamps",
          message: "Show timestamps",
        })}
        description={
          support.timestamps
            ? t({
                id: "library.import.timestamps_supported",
                message: "Enabled for supported models",
              })
            : t({
                id: "library.import.timestamps_unsupported",
                message: "Not supported by this model",
              })
        }
        enabled={preferences.showTimestamps}
        onToggle={() =>
          support.timestamps &&
          change({ showTimestamps: !preferences.showTimestamps })
        }
        ariaLabel={t({
          id: "library.import.show_timestamps.aria",
          message: "Show timestamps",
        })}
        disabled={!support.timestamps}
      />
      {support.diarization && (
        <ImportToggleRow
          layout="file"
          title={t({
            id: "library.import.detect_speakers",
            message: "Detect speakers",
          })}
          description={t({
            id: "library.import.detect_speakers.description",
            message: "Label segments by speaker automatically",
          })}
          enabled={preferences.detectSpeakers}
          onToggle={() =>
            change({ detectSpeakers: !preferences.detectSpeakers })
          }
          ariaLabel={t({
            id: "library.import.detect_speakers.aria",
            message: "Detect speakers",
          })}
        />
      )}
    </>
  );
};
