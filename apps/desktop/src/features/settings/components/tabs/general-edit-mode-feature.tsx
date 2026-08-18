import { useLingui } from "@lingui/react/macro";
import { Info } from "@phosphor-icons/react";
import { useState, type KeyboardEvent } from "react";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import type { GeneralFeatureProps } from "./GeneralTab.types";
import { aiFeatureAccess } from "./general-settings-model";
import { EditModeHelp } from "./general-edit-mode-help";

const editModeClass = {
  body: "px-2.5 py-2",
  card: "rounded-lg bg-surface-surface transition-opacity",
  copy: "ui-text-meta ui-color-muted",
  helpButton:
    "p-0.5 text-content-disabled transition-colors enabled:hover:text-content-muted disabled:pointer-events-none",
  helpPosition: "relative",
  label: "ui-text-label-strong ui-color-primary",
  link: "ui-color-primary underline decoration-[var(--color-border-secondary)] underline-offset-2 transition-colors hover:decoration-[var(--color-text-primary)]",
  row: "flex items-center justify-between",
  secondaryRow: "mt-0.5 flex items-center justify-between",
} as const;

export function EditModeFeature(props: GeneralFeatureProps) {
  const { t } = useLingui();
  const [helpOpen, setHelpOpen] = useState(false);
  const access = aiFeatureAccess(
    props.aiFeaturesReady,
    props.licenseGateActive,
  );
  const requiresAccount = access.settingsTarget === "account";
  const showHelp = !access.disabled && helpOpen;
  const toggleEditMode = () => {
    if (props.aiFeaturesReady) {
      props.setEditModeEnabled(!props.editModeEnabled);
    }
  };
  const handleHelpKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (access.disabled) return;
    if (event.key === "Escape") setHelpOpen(false);
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setHelpOpen((open) => !open);
    }
  };

  return (
    <div
      className={`${editModeClass.card} ${
        access.disabled ? "opacity-55" : "opacity-100"
      }`}
    >
      <div className={editModeClass.body}>
        <div className={editModeClass.row}>
          <span className={editModeClass.label}>
            {t({ id: "settings.general.edit_mode", message: "Edit Mode" })}
          </span>
          <ToggleSwitch
            enabled={props.editModeEnabled}
            onToggle={toggleEditMode}
            ariaLabel={t({
              id: "settings.general.edit_mode.toggle_aria",
              message: "Toggle Edit Mode",
            })}
            disabled={access.disabled}
          />
        </div>
        <div className={editModeClass.secondaryRow}>
          <span className={editModeClass.copy}>
            <EditModeDescription {...props} requiresAccount={requiresAccount} />
          </span>
          <div
            className={editModeClass.helpPosition}
            onMouseEnter={() => !access.disabled && setHelpOpen(true)}
            onMouseLeave={() => setHelpOpen(false)}
          >
            <button
              type="button"
              disabled={access.disabled}
              className={editModeClass.helpButton}
              aria-label={t({
                id: "settings.general.edit_mode.info_aria",
                message: "More information about Edit Mode",
              })}
              aria-expanded={showHelp}
              aria-controls="edit-mode-help-tooltip"
              onFocus={() => !access.disabled && setHelpOpen(true)}
              onBlur={() => setHelpOpen(false)}
              onKeyDown={handleHelpKey}
            >
              <Info size={10} aria-hidden="true" />
            </button>
            <EditModeHelp
              visible={showHelp}
              requiresAccount={requiresAccount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditModeDescription(
  props: GeneralFeatureProps & { requiresAccount: boolean },
) {
  const { t } = useLingui();
  if (props.aiFeaturesReady) {
    return t({
      id: "settings.general.edit_mode.body",
      message: "transform selected text with voice",
    });
  }

  const openSettings = props.requiresAccount
    ? props.onOpenAccountTab
    : props.onOpenProvidersTab;
  return (
    <>
      {props.requiresAccount
        ? t({
            id: "settings.general.edit_mode.license_prefix",
            message: "Activate your Looper license in",
          })
        : t({
            id: "settings.general.edit_mode.configure_prefix",
            message: "Set up AI writing in",
          })}{" "}
      <button
        type="button"
        onClick={openSettings}
        className={editModeClass.link}
      >
        {props.requiresAccount
          ? t({ id: "settings.general.account_tab", message: "Account" })
          : t({ id: "settings.general.providers_tab", message: "Providers" })}
      </button>{" "}
      {t({
        id: "settings.general.edit_mode.models_suffix",
        message: "to use Edit Mode.",
      })}
    </>
  );
}
