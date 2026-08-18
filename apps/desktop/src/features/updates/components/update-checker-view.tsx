import { useLingui } from "@lingui/react/macro";
import {
  ArrowsClockwise as RefreshIcon,
  CheckCircle as SuccessIcon,
  CircleNotch as ProgressIcon,
  DownloadSimple as DownloadIcon,
  WarningCircle as WarningIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import DotMatrix from "../../../shared/ui/DotMatrix";
import type { UpdateCheckerModel } from "./use-update-checker";

const BOX_CLASS_NAME =
  "flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 h-[52px]";
const ENTER_MOTION = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
};
const ACTION_CLASS_NAME = {
  restart: [
    "rounded-lg bg-green-500 px-2.5 py-1.5 ui-text-button",
    "ui-color-on-solid hover:bg-green-400 transition-colors shrink-0",
  ].join(" "),
  install: [
    "rounded-lg bg-amber-400 px-2.5 py-1.5 ui-text-button",
    "ui-color-on-warning hover:bg-amber-300 transition-colors shrink-0",
  ].join(" "),
  retry: [
    "flex items-center gap-1.5 rounded-lg border border-red-500/20",
    "px-2.5 py-1.5 ui-text-button ui-color-error-strong",
    "hover:bg-red-500/10 transition-colors shrink-0",
  ].join(" "),
  check: [
    "p-1.5 rounded-md text-content-muted hover:text-content-secondary",
    "hover:bg-surface-elevated transition-colors disabled:opacity-50",
    "disabled:cursor-not-allowed shrink-0",
  ].join(" "),
};

type UpdateCopy = ReturnType<typeof useUpdateCopy>;

export function UpdateCheckerView(model: UpdateCheckerModel) {
  const copy = useUpdateCopy();
  if (model.configured === false) {
    return <UnavailableUpdateChannel label={copy.notConfigured} />;
  }
  if (model.installed) {
    return <InstalledUpdate copy={copy} onRestart={model.restart} />;
  }
  if (model.availableVersion) {
    return <AvailableUpdate copy={copy} model={model} />;
  }
  if (model.checkError) {
    return (
      <FailedUpdateCheck
        copy={copy}
        error={model.checkError}
        onRetry={model.check}
      />
    );
  }
  return (
    <CurrentUpdate
      copy={copy}
      checking={model.checking}
      onCheck={model.check}
    />
  );
}

function UnavailableUpdateChannel({ label }: { label: string }) {
  return (
    <div className={`${BOX_CLASS_NAME} bg-surface-surface`}>
      <WarningIcon size={16} className="text-content-disabled shrink-0" />
      <p className="ui-text-body-sm ui-color-muted">{label}</p>
    </div>
  );
}

function InstalledUpdate({
  copy,
  onRestart,
}: {
  copy: UpdateCopy;
  onRestart: () => Promise<void>;
}) {
  return (
    <motion.div
      {...ENTER_MOTION}
      className={`${BOX_CLASS_NAME} border border-green-500/20 bg-green-500/10`}
    >
      <SuccessIcon size={16} className="ui-color-success-strong shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="ui-text-body-sm-strong ui-color-success-strong">
          {copy.installed}
        </p>
        <p className="ui-text-meta ui-color-success-subtle">
          {copy.restartToApply}
        </p>
      </div>
      <motion.button
        onClick={onRestart}
        className={ACTION_CLASS_NAME.restart}
        whileTap={{ scale: 0.97 }}
      >
        {copy.restart}
      </motion.button>
    </motion.div>
  );
}

function AvailableUpdate({
  copy,
  model,
}: {
  copy: UpdateCopy;
  model: UpdateCheckerModel;
}) {
  return (
    <motion.div
      {...ENTER_MOTION}
      className={`${BOX_CLASS_NAME} border border-amber-400/20 bg-amber-400/5`}
    >
      <DownloadIcon size={16} className="ui-color-warning-strong shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="ui-text-body-sm-strong ui-color-warning-strong truncate">
          {copy.available(model.availableVersion)}
        </p>
        {model.downloadError ? (
          <p
            className="ui-text-meta ui-color-error-subtle truncate"
            title={model.downloadError}
          >
            {model.downloadError}
          </p>
        ) : (
          <p className="ui-text-meta ui-color-warning-subtle">
            {copy.readyToInstall}
          </p>
        )}
      </div>
      <AvailableUpdateAction copy={copy} model={model} />
    </motion.div>
  );
}

function AvailableUpdateAction({
  copy,
  model,
}: {
  copy: UpdateCopy;
  model: UpdateCheckerModel;
}) {
  return (
    <AnimatePresence mode="wait">
      {model.downloading ? (
        <motion.div
          key="downloading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 shrink-0"
        >
          <DotMatrix
            rows={2}
            cols={10}
            activeDots={progressDots(model.progress)}
            dotSize={2}
            gap={2}
            color="var(--color-accent)"
            className="opacity-80"
          />
          <span className="ui-text-meta ui-color-muted w-8 tabular-nums">
            {model.progress}%
          </span>
        </motion.div>
      ) : (
        <motion.button
          key="update-btn"
          onClick={model.install}
          className={ACTION_CLASS_NAME.install}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {copy.update}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function FailedUpdateCheck({
  copy,
  error,
  onRetry,
}: {
  copy: UpdateCopy;
  error: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <div className={`${BOX_CLASS_NAME} border border-red-500/20 bg-red-500/5`}>
      <WarningIcon size={16} className="ui-color-error-strong shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="ui-text-body-sm-strong ui-color-error-strong">
          {copy.checkFailed}
        </p>
        <p
          className="ui-text-meta ui-color-error-subtle truncate"
          title={error}
        >
          {error}
        </p>
      </div>
      <motion.button
        onClick={onRetry}
        className={ACTION_CLASS_NAME.retry}
        whileTap={{ scale: 0.97 }}
      >
        <RefreshIcon size={12} />
        {copy.retry}
      </motion.button>
    </div>
  );
}

function CurrentUpdate({
  copy,
  checking,
  onCheck,
}: {
  copy: UpdateCopy;
  checking: boolean;
  onCheck: () => Promise<void>;
}) {
  return (
    <div className={`${BOX_CLASS_NAME} bg-surface-surface`}>
      {checking ? (
        <>
          <ProgressIcon
            size={16}
            className="text-content-muted animate-spin shrink-0"
          />
          <p className="flex-1 ui-text-body-sm ui-color-muted">
            {copy.checking}
          </p>
        </>
      ) : (
        <>
          <SuccessIcon size={16} className="text-content-disabled shrink-0" />
          <p className="flex-1 ui-text-body-sm ui-color-primary">
            {copy.upToDate}
          </p>
        </>
      )}
      <motion.button
        onClick={onCheck}
        disabled={checking}
        className={ACTION_CLASS_NAME.check}
        whileTap={{ scale: 0.95 }}
        title={copy.checkTitle}
        aria-label={copy.checkAria}
      >
        <RefreshIcon size={14} />
      </motion.button>
    </div>
  );
}

function progressDots(progress: number) {
  const activeColumns = Math.min(10, Math.max(0, Math.floor(progress / 10)));
  return Array.from({ length: activeColumns }, (_, column) => [
    column,
    column + 10,
  ]).flat();
}

function useUpdateCopy() {
  const { t } = useLingui();
  return {
    notConfigured: t({
      id: "updates.not_configured",
      message: "Update channel not configured",
    }),
    installed: t({ id: "updates.installed", message: "Update installed" }),
    restartToApply: t({
      id: "updates.restart_to_apply",
      message: "Restart to apply",
    }),
    restart: t({ id: "updates.restart", message: "Restart" }),
    available: (version: string | null) =>
      t({
        id: "updates.available_version",
        message: `v${{ version }} available`,
      }),
    readyToInstall: t({
      id: "updates.ready_to_install",
      message: "Ready to install",
    }),
    update: t({ id: "updates.update", message: "Update" }),
    checkFailed: t({
      id: "updates.check_failed",
      message: "Update check failed",
    }),
    retry: t({ id: "updates.retry", message: "Retry" }),
    checking: t({
      id: "updates.checking",
      message: "Checking for updates...",
    }),
    upToDate: t({ id: "updates.up_to_date", message: "You're up to date" }),
    checkTitle: t({
      id: "updates.check_title",
      message: "Check for updates",
    }),
    checkAria: t({
      id: "updates.check_aria",
      message: "Check for updates",
    }),
  };
}
