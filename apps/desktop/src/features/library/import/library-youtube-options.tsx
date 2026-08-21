import { useLingui } from "@lingui/react/macro";
import type { DropdownOption } from "../../../shared/ui/Dropdown";
import { ImportModelPicker, ImportToggleRow } from "./library-import-controls";
import type {
  ImportModelSupport,
  ImportPreferences,
} from "./library-import-policy";

type YoutubeImportOptionsProps = {
  modelOptions: DropdownOption<string>[];
  selectedModelKey: string;
  preferences: ImportPreferences;
  support: ImportModelSupport;
  onModelChange: (modelKey: string) => void;
  onPreferencesChange: (preferences: ImportPreferences) => void;
};

export const YoutubeImportOptions = ({
  modelOptions,
  selectedModelKey,
  preferences,
  support,
  onModelChange,
  onPreferencesChange,
}: YoutubeImportOptionsProps) => {
  const { t } = useLingui();
  const change = (patch: Partial<ImportPreferences>) =>
    onPreferencesChange({ ...preferences, ...patch });
  return (
    <>
      <ImportModelPicker
        value={selectedModelKey}
        options={modelOptions}
        onChange={onModelChange}
      />
      <ImportToggleRow
        layout="youtube"
        title={t({
          id: "library.import.store_original",
          message: "Store original file",
        })}
        description={t({
          id: "library.youtube.store_description",
          message: "Keep the downloaded audio inside Library",
        })}
        enabled={preferences.storeOriginal}
        onToggle={() => change({ storeOriginal: !preferences.storeOriginal })}
        ariaLabel={t({
          id: "library.import.store_original.aria",
          message: "Store original",
        })}
      />
      <ImportToggleRow
        layout="youtube"
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
      {support.timestamps && (
        <ImportToggleRow
          layout="compact"
          title={t({
            id: "library.import.timestamps",
            message: "Include timestamps",
          })}
          enabled={preferences.showTimestamps}
          onToggle={() =>
            change({ showTimestamps: !preferences.showTimestamps })
          }
          ariaLabel={t({
            id: "library.import.timestamps.aria",
            message: "Include timestamps",
          })}
        />
      )}
      {support.diarization && (
        <ImportToggleRow
          layout="compact"
          title={t({
            id: "library.import.detect_speakers",
            message: "Detect speakers",
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
