import { useLingui } from "@lingui/react/macro";
import { useState, type ReactNode } from "react";
import { Info } from "@phosphor-icons/react";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import type { GeneralFeatureProps } from "./GeneralTab.types";
import {
  aiFeatureAccess,
  isGeneralSectionVisible,
} from "./general-settings-model";

export function GeneralFeatureSection(props: GeneralFeatureProps) {
  const { t } = useLingui();
  const autoDictionaryBody = props.autoDictionarySupported
    ? t({
        id: "settings.general.auto_dictionary.body",
        message: "suggests names and terms after you correct dictated text",
      })
    : t({
        id: "settings.general.auto_dictionary.unsupported_body",
        message: "requires a model with dictionary support",
      });

  return (
    <section
      data-settings-section="behavior"
      className={
        isGeneralSectionVisible(props.activeSection, "behavior")
          ? "space-y-2"
          : "hidden"
      }
    >
      <SectionLabel>
        {t({ id: "settings.general.features", message: "Features" })}
      </SectionLabel>
      <div className="space-y-3">
        <EditModeFeature {...props} />
        <FeatureToggle
          label={t({
            id: "settings.general.auto_dictionary",
            message: "Auto Dictionary",
          })}
          description={autoDictionaryBody}
          enabled={props.autoDictionarySupported && props.autoDictionaryEnabled}
          disabled={!props.autoDictionarySupported}
          onToggle={() =>
            props.setAutoDictionaryEnabled(!props.autoDictionaryEnabled)
          }
          ariaLabel={t({
            id: "settings.general.auto_dictionary.toggle_aria",
            message: "Toggle Auto Dictionary",
          })}
        />
        <FeatureToggle
          label={t({
            id: "settings.general.preview_before_insert",
            message: "Preview Before Inserting",
          })}
          description={t({
            id: "settings.general.preview_before_insert.body",
            message:
              "review and edit the transcript in the pill — Enter inserts, Esc cancels",
          })}
          enabled={props.previewBeforeInsertEnabled}
          onToggle={() =>
            props.setPreviewBeforeInsertEnabled(
              !props.previewBeforeInsertEnabled,
            )
          }
          ariaLabel={t({
            id: "settings.general.preview_before_insert.toggle_aria",
            message: "Toggle Preview Before Inserting",
          })}
        />
        <FeatureToggle
          label={t({
            id: "settings.general.preview_before_insert_selection",
            message: "Preview Before Applying Transforms",
          })}
          description={t({
            id: "settings.general.preview_before_insert_selection.body",
            message:
              "same as above, but for Selection Mode's Replace/Insert actions — on by default since transforms are costlier to undo than dictation",
          })}
          enabled={props.previewBeforeInsertSelectionEnabled}
          onToggle={() =>
            props.setPreviewBeforeInsertSelectionEnabled(
              !props.previewBeforeInsertSelectionEnabled,
            )
          }
          ariaLabel={t({
            id: "settings.general.preview_before_insert_selection.toggle_aria",
            message: "Toggle Preview Before Applying Transforms",
          })}
        />
        <FeatureToggle
          label={t({
            id: "settings.general.use_screen_context",
            message: "Use Screen Context",
          })}
          description={t({
            id: "settings.general.use_screen_context.body",
            message:
              "let Selection Mode transforms read visible text for better results — Accessibility is used first; on macOS 14+, Screen Recording and on-device OCR fill gaps in canvases or images. Only recognized text is sent to your configured writing provider; screenshots are never saved or uploaded",
          })}
          enabled={props.useScreenContext}
          onToggle={() => props.setUseScreenContext(!props.useScreenContext)}
          ariaLabel={t({
            id: "settings.general.use_screen_context.toggle_aria",
            message: "Toggle Use Screen Context",
          })}
        />
      </div>
    </section>
  );
}

function EditModeFeature(props: GeneralFeatureProps) {
  const { t } = useLingui();
  const [helpOpen, setHelpOpen] = useState(false);
  const access = aiFeatureAccess(
    props.aiFeaturesReady,
    props.licenseGateActive,
  );
  const requiresAccount = access.settingsTarget === "account";

  return (
    <div
      className={`rounded-lg bg-surface-surface transition-opacity ${
        access.disabled ? "opacity-55" : "opacity-100"
      }`}
    >
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="ui-text-label-strong ui-color-primary">
            {t({ id: "settings.general.edit_mode", message: "Edit Mode" })}
          </span>
          <ToggleSwitch
            enabled={props.editModeEnabled}
            onToggle={() =>
              props.aiFeaturesReady &&
              props.setEditModeEnabled(!props.editModeEnabled)
            }
            ariaLabel={t({
              id: "settings.general.edit_mode.toggle_aria",
              message: "Toggle Edit Mode",
            })}
            disabled={access.disabled}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="ui-text-meta ui-color-muted">
            {access.disabled ? (
              <>
                {requiresAccount
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
                  onClick={
                    requiresAccount
                      ? props.onOpenAccountTab
                      : props.onOpenProvidersTab
                  }
                  className="ui-color-primary underline decoration-[var(--color-border-secondary)] underline-offset-2 transition-colors hover:decoration-[var(--color-text-primary)]"
                >
                  {requiresAccount
                    ? t({
                        id: "settings.general.account_tab",
                        message: "Account",
                      })
                    : t({
                        id: "settings.general.providers_tab",
                        message: "Providers",
                      })}
                </button>{" "}
                {t({
                  id: "settings.general.edit_mode.models_suffix",
                  message: "to use Edit Mode.",
                })}
              </>
            ) : (
              t({
                id: "settings.general.edit_mode.body",
                message: "transform selected text with voice",
              })
            )}
          </span>
          <div
            className="relative"
            onMouseEnter={() => !access.disabled && setHelpOpen(true)}
            onMouseLeave={() => setHelpOpen(false)}
          >
            <button
              type="button"
              disabled={access.disabled}
              className="p-0.5 text-content-disabled transition-colors enabled:hover:text-content-muted disabled:pointer-events-none"
              aria-label={t({
                id: "settings.general.edit_mode.info_aria",
                message: "More information about Edit Mode",
              })}
              aria-expanded={!access.disabled && helpOpen}
              aria-controls="edit-mode-help-tooltip"
              onFocus={() => !access.disabled && setHelpOpen(true)}
              onBlur={() => setHelpOpen(false)}
              onKeyDown={(event) => {
                if (access.disabled) return;
                if (event.key === "Escape") setHelpOpen(false);
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setHelpOpen((open) => !open);
                }
              }}
            >
              <Info size={10} aria-hidden="true" />
            </button>
            <EditModeHelp
              visible={!access.disabled && helpOpen}
              requiresAccount={requiresAccount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditModeHelp({
  visible,
  requiresAccount,
}: {
  visible: boolean;
  requiresAccount: boolean;
}) {
  const { t } = useLingui();
  return (
    <div
      id="edit-mode-help-tooltip"
      role="tooltip"
      className={`absolute right-0 bottom-full z-tooltip mb-1 ${
        visible ? "block" : "hidden"
      }`}
    >
      <div className="w-44 rounded-lg border border-border-secondary bg-surface-overlay px-2.5 py-1.5 ui-text-micro ui-color-secondary shadow-lg leading-tight">
        <p>
          {t({
            id: "settings.general.edit_mode.help",
            message:
              'Select text in any app, and speak a command like "make this formal" or "fix my grammar".',
          })}
        </p>
        {!visible && (
          <p className="mt-1 text-warning">
            {requiresAccount
              ? t({
                  id: "settings.general.edit_mode.help_license_requirement",
                  message: "Requires a Looper license.",
                })
              : t({
                  id: "settings.general.edit_mode.help_requirement",
                  message:
                    "Requires an enabled and configured writing provider.",
                })}
          </p>
        )}
      </div>
    </div>
  );
}

function FeatureToggle({
  label,
  description,
  enabled,
  disabled = false,
  onToggle,
  ariaLabel,
}: {
  label: string;
  description: ReactNode;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="rounded-lg bg-surface-surface">
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="ui-text-label-strong ui-color-primary">{label}</span>
          <ToggleSwitch
            enabled={enabled}
            disabled={disabled}
            onToggle={onToggle}
            ariaLabel={ariaLabel}
          />
        </div>
        <span className="mt-0.5 block ui-text-meta ui-color-muted">
          {description}
        </span>
      </div>
    </div>
  );
}
