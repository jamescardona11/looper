import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Broom as BrushCleaning, Ghost, Info } from "@phosphor-icons/react";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import { ShortcutRow, type ShortcutMode } from "./GeneralShortcuts";
import type { GeneralShortcutProps } from "./GeneralTab.types";
import { isGeneralSectionVisible } from "./general-settings-model";

export function GeneralShortcutSection(props: GeneralShortcutProps) {
  const { t } = useLingui();
  const [expandedMode, setExpandedMode] = useState<ShortcutMode | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const modes = [
    {
      mode: "smart" as const,
      label: t({
        id: "settings.general.shortcuts.smart",
        message: "Dictation",
      }),
      description: t({
        id: "settings.general.shortcuts.smart_description",
        message: "hold to dictate, release to transcribe",
      }),
      enabled: props.smartEnabled,
      setEnabled: props.setSmartEnabled,
      canDisable: props.holdEnabled || props.toggleEnabled,
    },
    {
      mode: "hold" as const,
      label: t({ id: "settings.general.shortcuts.hold", message: "Hold" }),
      description: t({
        id: "settings.general.shortcuts.hold_description",
        message: "hold to talk, release to stop",
      }),
      enabled: props.holdEnabled,
      setEnabled: props.setHoldEnabled,
      canDisable: props.smartEnabled || props.toggleEnabled,
    },
    {
      mode: "toggle" as const,
      label: t({ id: "settings.general.shortcuts.toggle", message: "Toggle" }),
      description: t({
        id: "settings.general.shortcuts.toggle_description",
        message: "tap to start, tap to stop",
      }),
      enabled: props.toggleEnabled,
      setEnabled: props.setToggleEnabled,
      canDisable: props.smartEnabled || props.holdEnabled,
    },
  ];

  return (
    <section
      data-settings-section="shortcuts"
      className={
        isGeneralSectionVisible(props.activeSection, "shortcuts")
          ? "space-y-2"
          : "hidden"
      }
    >
      <SectionLabel
        trailing={
          <div
            className="relative"
            onMouseEnter={() => setHelpOpen(true)}
            onMouseLeave={() => setHelpOpen(false)}
          >
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center text-content-disabled transition-colors hover:text-content-muted"
              aria-label={t({
                id: "settings.general.shortcuts.info_aria",
                message: "More information about shortcut options",
              })}
              aria-expanded={helpOpen}
              aria-controls="shortcuts-help-tooltip"
              onFocus={() => setHelpOpen(true)}
              onBlur={() => setHelpOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setHelpOpen(false);
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setHelpOpen((open) => !open);
                }
              }}
            >
              <Info size={10} aria-hidden="true" />
            </button>
            <ShortcutHelp visible={helpOpen} />
          </div>
        }
      >
        {t({ id: "settings.general.shortcuts", message: "Shortcuts" })}
      </SectionLabel>

      <div className="relative space-y-3 rounded-lg bg-surface-surface p-2.5">
        {modes.map((item) => (
          <ShortcutRow
            key={item.mode}
            mode={item.mode}
            label={item.label}
            description={item.description}
            bindings={props.shortcutBindings[item.mode]}
            invalidDrafts={props.invalidShortcutDrafts[item.mode]}
            enabled={item.enabled}
            isExpanded={expandedMode === item.mode}
            captureActive={props.captureActive}
            capturePreview={props.capturePreview}
            onToggle={() => item.setEnabled(!item.enabled)}
            onCapture={(index) => {
              if (item.enabled) props.onStartCapture(item.mode, index);
            }}
            onToggleExpand={() =>
              setExpandedMode((current) =>
                current === item.mode ? null : item.mode,
              )
            }
            onUpdateBinding={props.updateShortcutBinding}
            onAddBinding={props.addShortcutBinding}
            onRemoveBinding={props.removeShortcutBinding}
            canDisable={item.canDisable}
            cleanupDisabled={!props.aiFeaturesReady}
          />
        ))}
      </div>
    </section>
  );
}

function ShortcutHelp({ visible }: { visible: boolean }) {
  const { t } = useLingui();
  return (
    <div
      id="shortcuts-help-tooltip"
      role="tooltip"
      className={`absolute left-0 bottom-full z-tooltip mb-1 ${
        visible ? "block" : "hidden"
      }`}
    >
      <div className="w-56 rounded-lg border border-border-secondary bg-surface-overlay px-2.5 py-1.5 ui-text-micro ui-color-secondary shadow-lg leading-tight">
        <p>
          <Ghost
            size={10}
            className="mr-1 inline-block align-[-1px]"
            aria-hidden="true"
          />
          {t({
            id: "settings.general.shortcuts.help_temporary",
            message:
              "Makes a shortcut temporary. It will not save audio, transcript, or history.",
          })}
        </p>
        <p className="mt-1">
          <BrushCleaning
            size={10}
            className="mr-1 inline-block align-[-1px]"
            aria-hidden="true"
          />
          {t({
            id: "settings.general.shortcuts.help_cleanup",
            message: "Runs Cleanup for that shortcut only.",
          })}
        </p>
      </div>
    </div>
  );
}
