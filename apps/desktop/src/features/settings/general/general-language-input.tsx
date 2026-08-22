import { useLingui } from "@lingui/react/macro";
import { Info } from "@phosphor-icons/react";
import { Dropdown } from "../../../shared/ui/Dropdown";
import type { GeneralInputProps } from "./GeneralTab.types";

const languageClass = {
  guidance: "ui-text-micro ui-color-secondary leading-tight",
  heading: "ui-text-label-strong ui-color-primary leading-none",
  infoButton:
    "flex h-4 w-4 items-center justify-center text-content-disabled transition-colors hover:text-content-muted",
  infoFrame: "group relative",
  infoPanel:
    "absolute right-0 bottom-full z-tooltip mb-1 hidden group-hover:block group-focus-within:block",
  infoSurface:
    "w-56 px-2.5 py-1.5 ui-surface-menu ui-text-micro ui-color-secondary leading-tight",
  labelRow: "flex items-center gap-1",
  top: "flex h-5 items-center",
} as const;

function languageChoices(settings: GeneralInputProps) {
  return settings.languages.map((language) => ({
    value: language.code,
    label: language.name,
    locked: language.locked,
    isHeader: language.isHeader,
    prominentHeader: language.prominentHeader,
    description: language.description,
  }));
}

export function LanguageInput({
  settings,
  onMenuChange,
}: {
  settings: GeneralInputProps;
  onMenuChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const languageOptions = languageChoices(settings);

  return (
    <div className="space-y-1.5">
      <div className={languageClass.top}>
        <div className={languageClass.labelRow}>
          <span className={languageClass.heading}>
            {t({
              id: "settings.general.transcription_language",
              message: "Dictation Language",
            })}
          </span>
          <LanguageSupportHint />
        </div>
      </div>
      <Dropdown
        value={settings.language}
        onChange={settings.onLanguageChange}
        onOpenChange={onMenuChange}
        options={languageOptions}
        searchable
        searchPlaceholder={t({
          id: "settings.general.search_language",
          message: "Search language...",
        })}
        buttonClassName="min-h-[38px] px-3 py-2 ui-text-body-sm"
      />
      <p className={languageClass.guidance}>{settings.languageGuidance}</p>
    </div>
  );
}

function LanguageSupportHint() {
  const { t } = useLingui();
  return (
    <div className={languageClass.infoFrame}>
      <button
        type="button"
        className={languageClass.infoButton}
        aria-label={t({
          id: "settings.general.language_info_aria",
          message: "More information about transcription language support",
        })}
      >
        <Info size={10} aria-hidden="true" />
      </button>
      <div className={languageClass.infoPanel}>
        <div className={languageClass.infoSurface}>
          {t({
            id: "settings.general.language_info.active_model",
            message:
              "Unsupported languages aren't available on your active model. Switch to a supported model to use them.",
          })}
        </div>
      </div>
    </div>
  );
}
