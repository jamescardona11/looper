import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  ArrowElbowDownRight as CornerDownRight,
} from "@phosphor-icons/react";
import { Dropdown } from "../../../../shared/ui/Dropdown";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import type { AppAutomationProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import {
  inlineAutoDeleteDropdownProps,
  type AppTabControls,
} from "./useAppTabControls";

export function AppAutomationSection({
  controls,
  ...props
}: AppAutomationProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  return (
    <section
      data-settings-section="storage"
      className={
        isAppSectionVisible(props.activeSection, "storage")
          ? "flex flex-col space-y-2"
          : "hidden"
      }
    >
      <SectionLabel className="shrink-0">
        {t({ id: "settings.app.automation", message: "Automation" })}
      </SectionLabel>
      <div className="flex-1 space-y-6 rounded-lg bg-surface-surface p-2.5">
        {props.platformCapabilities.supportsAutoPauseMedia && (
          <MediaActionSetting {...props} controls={controls} />
        )}
        <AutomationToggle
          label={t({ id: "settings.app.auto_update", message: "Auto-update" })}
          description={t({
            id: "settings.app.auto_update.body",
            message: "downloads and installs updates in the background.",
          })}
          enabled={props.autoUpdateEnabled}
          onToggle={() =>
            props.onAutoUpdateEnabledChange(!props.autoUpdateEnabled)
          }
          ariaLabel={t({
            id: "settings.app.auto_update.toggle_aria",
            message: "Toggle auto-update",
          })}
        />
        <LaunchAtLoginSetting {...props} />
        <RetentionSetting {...props} controls={controls} />
      </div>
      <p className="invisible px-0.5 ui-text-micro" aria-hidden="true">
        &nbsp;
      </p>
    </section>
  );
}

function MediaActionSetting({
  controls,
  mediaAction,
}: AppAutomationProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  const previous = () =>
    controls.handleDuckChange(Math.max(0, controls.duckIndex - 1));
  const next = () =>
    controls.handleDuckChange(
      Math.min(controls.duckStops.length - 1, controls.duckIndex + 1),
    );
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-text-label-strong ui-color-primary">
          {t({
            id: "settings.app.auto_pause_media",
            message: "Auto-pause Media",
          })}
        </span>
        <div className="flex items-center gap-0.5 ui-text-micro leading-none">
          <button
            type="button"
            onClick={previous}
            disabled={controls.duckIndex === 0}
            aria-label={t({
              id: "settings.app.auto_pause_media.lower",
              message: "Previous media action",
            })}
            className={`p-0.5 transition-colors ${
              controls.duckIndex === 0
                ? "text-content-disabled"
                : "text-content-muted hover:text-content-primary"
            }`}
          >
            <ChevronLeft size={10} aria-hidden="true" />
          </button>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={controls.duckIndex}
              initial={{ opacity: 0, y: -2, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 2, scale: 0.92 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onMouseDown={controls.handleDuckScrubStart}
              onTouchStart={controls.handleDuckScrubStart}
              className={`w-[40px] min-w-[40px] cursor-ew-resize select-none text-center font-medium tabular-nums ${
                mediaAction === "off" ? "ui-color-disabled" : "ui-color-cloud"
              }`}
            >
              {controls.duckStops[controls.duckIndex].label}
            </motion.span>
          </AnimatePresence>
          <button
            type="button"
            onClick={next}
            disabled={controls.duckIndex === controls.duckStops.length - 1}
            aria-label={t({
              id: "settings.app.auto_pause_media.raise",
              message: "Next media action",
            })}
            className={`p-0.5 transition-colors ${
              controls.duckIndex === controls.duckStops.length - 1
                ? "text-content-disabled"
                : "text-content-muted hover:text-content-primary"
            }`}
          >
            <ChevronRight size={10} aria-hidden="true" />
          </button>
        </div>
      </div>
      <span className="mt-0.5 block ui-text-micro ui-color-disabled">
        {controls.duckDescription}
      </span>
    </div>
  );
}

function LaunchAtLoginSetting(props: AppAutomationProps) {
  const { t } = useLingui();
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-text-label-strong ui-color-primary">
          {t({
            id: "settings.app.auto_launch",
            message: "Launch at Login",
          })}
        </span>
        <ToggleSwitch
          enabled={props.autoLaunchEnabled}
          onToggle={() =>
            props.onAutoLaunchEnabledChange(!props.autoLaunchEnabled)
          }
          ariaLabel={t({
            id: "settings.app.auto_launch.toggle_aria",
            message: "Toggle launch at login",
          })}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 pl-3">
        <div className="flex items-center gap-1.5 ui-text-meta text-content-secondary">
          <CornerDownRight
            size={10}
            className="text-content-disabled"
            aria-hidden="true"
          />
          {t({
            id: "settings.app.start_in_background",
            message: "Start in background",
          })}
        </div>
        <ToggleSwitch
          enabled={props.autoLaunchEnabled && props.startInBackground}
          disabled={!props.autoLaunchEnabled}
          onToggle={() =>
            props.onStartInBackgroundChange(!props.startInBackground)
          }
          ariaLabel={t({
            id: "settings.app.start_in_background.toggle_aria",
            message: "Toggle start in background",
          })}
          size="xs"
        />
      </div>
    </div>
  );
}

function RetentionSetting({
  controls,
  ...props
}: AppAutomationProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  return (
    <>
      <div className="relative overflow-visible px-2 py-1.5">
        <div
          className={
            props.textSizeMode === "large"
              ? "flex flex-wrap items-center gap-x-1 gap-y-1"
              : "flex items-center gap-x-1 whitespace-nowrap"
          }
        >
          <span className="shrink-0 ui-text-label-strong ui-color-primary">
            {t({ id: "settings.app.auto_delete", message: "Auto-delete" })}
          </span>
          <Dropdown
            value={props.autoDeleteTarget}
            onChange={(value) =>
              void controls.applyAutoDeleteChange(
                value,
                props.autoDeleteDuration,
              )
            }
            options={controls.pruneTargetOptions}
            disabled={controls.isPreviewingPrune}
            {...inlineAutoDeleteDropdownProps}
          />
          <span className="shrink-0 ui-text-label-strong ui-color-muted">
            {t({ id: "settings.app.auto_delete.after", message: "after" })}
          </span>
          <Dropdown
            value={props.autoDeleteDuration}
            onChange={(value) =>
              void controls.applyAutoDeleteChange(props.autoDeleteTarget, value)
            }
            options={controls.recordingPruneOptions}
            disabled={controls.isPreviewingPrune}
            {...inlineAutoDeleteDropdownProps}
          />
        </div>
        <span className="mt-1 block ui-text-micro ui-color-disabled">
          {t({
            id: "settings.app.auto_delete.body",
            message: "Deleting transcripts also removes their saved audio.",
          })}
        </span>
      </div>
      <div className="relative overflow-visible px-2 py-1.5">
        <div className="flex items-center gap-x-1 whitespace-nowrap">
          <span className="shrink-0 ui-text-label-strong ui-color-primary">
            {t({
              id: "settings.app.audio_budget",
              message: "Keep dictation audio under",
            })}
          </span>
          <Dropdown
            value={props.audioStorageBudgetMb}
            onChange={(value) => void controls.applyAudioBudgetChange(value)}
            options={controls.audioBudgetOptions}
            disabled={controls.isPreviewingBudget}
            {...inlineAutoDeleteDropdownProps}
          />
        </div>
        <span className="mt-1 block ui-text-micro ui-color-disabled">
          {t({
            id: "settings.app.audio_budget.body",
            message:
              "When the limit is exceeded, Looper removes the oldest saved audio first and keeps every transcript.",
          })}
        </span>
      </div>
    </>
  );
}

function AutomationToggle({
  label,
  description,
  enabled,
  onToggle,
  ariaLabel,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-text-label-strong ui-color-primary">{label}</span>
        <ToggleSwitch
          enabled={enabled}
          onToggle={onToggle}
          ariaLabel={ariaLabel}
        />
      </div>
      <span className="mt-0.5 block ui-text-micro ui-color-disabled">
        {description}
      </span>
    </div>
  );
}
