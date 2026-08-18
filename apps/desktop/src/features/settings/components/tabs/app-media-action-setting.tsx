import { useLingui } from "@lingui/react/macro";
import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType } from "react";
import type { AppAutomationProps } from "./AppTab.types";
import { SettingLine } from "./app-setting-line";
import type { AppTabControls } from "./useAppTabControls";

const valueMotion = {
  initial: { opacity: 0, y: -2, scale: 0.92 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 2, scale: 0.92 },
  transition: { duration: 0.16, ease: "easeOut" },
} as const;

type StepButtonProps = {
  disabled: boolean;
  icon: ComponentType<{ size: number; "aria-hidden": "true" }>;
  label: string;
  onClick: () => void;
};

function StepButton({ disabled, icon: Icon, label, onClick }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`p-0.5 transition-colors ${
        disabled
          ? "text-content-disabled"
          : "text-content-muted hover:text-content-primary"
      }`}
    >
      <Icon size={10} aria-hidden="true" />
    </button>
  );
}

export function MediaActionSetting({
  controls,
  mediaAction,
}: AppAutomationProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  const atFirstStop = controls.duckIndex === 0;
  const atLastStop = controls.duckIndex === controls.duckStops.length - 1;
  const previousLabel = t({
    id: "settings.app.auto_pause_media.lower",
    message: "Previous media action",
  });
  const nextLabel = t({
    id: "settings.app.auto_pause_media.raise",
    message: "Next media action",
  });
  const stepper = (
    <div className="flex items-center gap-0.5 ui-text-micro leading-none">
      <StepButton
        icon={ChevronLeft}
        disabled={atFirstStop}
        label={previousLabel}
        onClick={() =>
          controls.handleDuckChange(Math.max(0, controls.duckIndex - 1))
        }
      />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={controls.duckIndex}
          {...valueMotion}
          onMouseDown={controls.handleDuckScrubStart}
          onTouchStart={controls.handleDuckScrubStart}
          className={`w-[40px] min-w-[40px] cursor-ew-resize select-none text-center font-medium tabular-nums ${
            mediaAction === "off" ? "ui-color-disabled" : "ui-color-cloud"
          }`}
        >
          {controls.duckStops[controls.duckIndex].label}
        </motion.span>
      </AnimatePresence>
      <StepButton
        icon={ChevronRight}
        disabled={atLastStop}
        label={nextLabel}
        onClick={() =>
          controls.handleDuckChange(
            Math.min(controls.duckStops.length - 1, controls.duckIndex + 1),
          )
        }
      />
    </div>
  );

  return (
    <SettingLine
      label={t({
        id: "settings.app.auto_pause_media",
        message: "Auto-pause Media",
      })}
      control={stepper}
      description={controls.duckDescription}
    />
  );
}
