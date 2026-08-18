import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Warning } from "@phosphor-icons/react";

import { Dropdown, type DropdownOption } from "../../../shared/ui/Dropdown";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import type { RetranscriptionCapabilities } from "./library-retranscribe-model";

const OPTIONS_CLASS = ["flex flex-col", "gap-5", "px-5 py-5"].join(" ");
const EMPTY_CLASS = [
  "flex items-start gap-2",
  "ui-text-body-sm ui-color-warning-strong",
].join(" ");
const CAPABILITY_CLASS = ["flex items-center", "justify-between gap-4"].join(
  " ",
);
const OPTIONS_COPY = {
  noModels: msg({
    id: "library.retranscribe.no_models",
    message:
      "No models available. Configure a remote provider or download a local model in Settings -> Models before retranscribing.",
  }),
  model: msg({ id: "library.retranscribe.model", message: "Model" }),
  selectModel: msg({
    id: "library.retranscribe.select_model",
    message: "Select a model",
  }),
  searchModels: msg({
    id: "library.retranscribe.search_models",
    message: "Search installed models...",
  }),
  timestamps: msg({
    id: "library.retranscribe.show_timestamps",
    message: "Show timestamps",
  }),
  timestampsAria: msg({
    id: "library.retranscribe.show_timestamps.aria",
    message: "Show timestamps",
  }),
  timestampsSupported: msg({
    id: "library.retranscribe.timestamps_supported",
    message: "Enabled for supported models",
  }),
  timestampsUnsupported: msg({
    id: "library.retranscribe.timestamps_unsupported",
    message: "Not supported by this model",
  }),
  speakers: msg({
    id: "library.retranscribe.detect_speakers",
    message: "Detect speakers",
  }),
  speakersAria: msg({
    id: "library.retranscribe.detect_speakers.aria",
    message: "Detect speakers",
  }),
  speakersDescription: msg({
    id: "library.retranscribe.detect_speakers.description",
    message: "Label segments by speaker automatically",
  }),
};

type LibraryRetranscribeOptionsProps = {
  modelOptions: DropdownOption<string>[];
  selectedModelKey: string;
  onSelectModel: (modelKey: string) => void;
  capabilities: RetranscriptionCapabilities;
  showTimestamps: boolean;
  onShowTimestampsChange: (value: boolean) => void;
  detectSpeakers: boolean;
  onDetectSpeakersChange: (value: boolean) => void;
};

export function LibraryRetranscribeOptions({
  modelOptions,
  selectedModelKey,
  onSelectModel,
  capabilities,
  showTimestamps,
  onShowTimestampsChange,
  detectSpeakers,
  onDetectSpeakersChange,
}: LibraryRetranscribeOptionsProps) {
  const { i18n } = useLingui();

  return (
    <div className={OPTIONS_CLASS}>
      {modelOptions.length === 0 ? (
        <div className={EMPTY_CLASS}>
          <Warning size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{i18n._(OPTIONS_COPY.noModels)}</span>
        </div>
      ) : null}

      <div>
        <label className="ui-text-label text-content-muted">
          {i18n._(OPTIONS_COPY.model)}
        </label>
        <div className="mt-1.5">
          <Dropdown
            value={selectedModelKey || null}
            onChange={onSelectModel}
            options={modelOptions}
            placeholder={i18n._(OPTIONS_COPY.selectModel)}
            searchable
            searchPlaceholder={i18n._(OPTIONS_COPY.searchModels)}
          />
        </div>
      </div>

      <CapabilityToggle
        label={i18n._(OPTIONS_COPY.timestamps)}
        ariaLabel={i18n._(OPTIONS_COPY.timestampsAria)}
        description={
          capabilities.timestamps
            ? i18n._(OPTIONS_COPY.timestampsSupported)
            : i18n._(OPTIONS_COPY.timestampsUnsupported)
        }
        enabled={showTimestamps}
        disabled={!capabilities.timestamps}
        onToggle={() =>
          capabilities.timestamps && onShowTimestampsChange(!showTimestamps)
        }
      />

      {capabilities.diarization ? (
        <CapabilityToggle
          label={i18n._(OPTIONS_COPY.speakers)}
          ariaLabel={i18n._(OPTIONS_COPY.speakersAria)}
          description={i18n._(OPTIONS_COPY.speakersDescription)}
          enabled={detectSpeakers}
          disabled={false}
          onToggle={() => onDetectSpeakersChange(!detectSpeakers)}
        />
      ) : null}
    </div>
  );
}

function CapabilityToggle({
  label,
  ariaLabel,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  ariaLabel: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={CAPABILITY_CLASS}>
      <div className="min-w-0">
        <div className="ui-text-body-sm text-content-primary">{label}</div>
        <div className="ui-text-meta text-content-disabled">{description}</div>
      </div>
      <ToggleSwitch
        enabled={enabled}
        onToggle={onToggle}
        ariaLabel={ariaLabel}
        disabled={disabled}
        size="md"
      />
    </div>
  );
}
