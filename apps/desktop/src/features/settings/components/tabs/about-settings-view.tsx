import { useLingui } from "@lingui/react/macro";
import {
  ArrowCounterClockwise as RotateCcw,
  CircleNotch as Loader2,
  Info,
  Question as HelpCircle,
  TerminalWindow as Terminal,
} from "@phosphor-icons/react";
import { motion, type Variants } from "framer-motion";
import { resetOnboarding, revealLogs } from "../../../../data/settings";
import ActionCardButton from "../../../../shared/ui/ActionCardButton";
import HoldActionCardButton from "../../../../shared/ui/HoldActionCardButton";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import type {
  AppInfo,
  CliInstallStatus,
  TranscriptionMode,
} from "../../../../types";
import { AboutOverview } from "./AboutOverview";
import { AboutStorage } from "./AboutStorage";
import { classifyCli, storageMetrics, type CliState } from "./about-tab-model";

const ABOUT_STYLE = {
  tab: "space-y-5",
  section: "space-y-2",
  grid: "grid grid-cols-2 gap-4",
  card: "rounded-lg bg-surface-surface p-2.5",
  cardRow: "flex min-h-[52px] gap-2.5 px-1 py-0.5",
  terminal:
    "flex size-5 shrink-0 items-center justify-center self-center ui-color-muted",
  cardContent: "min-w-0 flex-1",
  commandRow: "flex items-center gap-2.5",
  commandTitle: "min-w-0 flex-1 truncate ui-text-label-strong ui-color-primary",
  infoAnchor: "group relative shrink-0",
  infoButton:
    "flex size-4 items-center justify-center ui-color-disabled transition-colors hover:ui-color-muted focus:ui-color-muted focus:outline-none",
  tooltipAnchor:
    "absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 group-hover:block group-focus-within:block",
  tooltip:
    "w-56 rounded-lg border border-border-secondary bg-surface-overlay px-2.5 py-1.5 leading-tight shadow-lg ui-text-micro ui-color-secondary",
  action:
    "inline-flex h-6 min-w-[4.75rem] shrink-0 items-center justify-center gap-1 px-1 ui-text-button-sm ui-color-secondary transition-colors hover:text-content-primary disabled:pointer-events-none disabled:opacity-60",
  subtitle: "mt-1 truncate ui-text-meta ui-color-muted",
} as const;

const ABOUT_MOTION = {
  initial: "hidden",
  animate: "visible",
  exit: "exit",
} as const;

type AboutTabProps = {
  variants: Variants;
  appInfo: AppInfo | null;
  transcriptionMode: TranscriptionMode;
  formatBytes: (bytes: number) => string;
  cliInstallStatus: CliInstallStatus | null;
  cliInstallBusy: boolean;
  activeLicense: boolean;
  onInstallCli: () => void;
  onRemoveCli: () => void;
  onOpenDataDir: () => void;
  onExportArchive: () => void;
  archiveExportStatus: "idle" | "exporting" | "complete";
  onOpenFAQ: () => void;
};

function AboutTab(props: AboutTabProps) {
  const app = props.appInfo;
  return (
    <motion.div
      key="about"
      variants={props.variants}
      {...ABOUT_MOTION}
      className={ABOUT_STYLE.tab}
    >
      <AboutOverview
        version={app?.version ?? null}
        transcriptionMode={props.transcriptionMode}
        onShowLogs={showLogs}
      />
      <AboutStorage
        metrics={storageMetrics(app)}
        dataPath={app?.data_dir_path ?? null}
        formatBytes={props.formatBytes}
        exportStatus={props.archiveExportStatus}
        onOpenDataDir={props.onOpenDataDir}
        onExportArchive={props.onExportArchive}
      />
      <AboutSetup
        onRestartOnboarding={() => void restartSetup()}
        onOpenFAQ={props.onOpenFAQ}
      />
      <AboutCli
        status={props.cliInstallStatus}
        busy={props.cliInstallBusy}
        activeAccess={props.activeLicense}
        onInstall={props.onInstallCli}
        onRemove={props.onRemoveCli}
      />
    </motion.div>
  );
}

export function AboutSetup(props: {
  onRestartOnboarding: () => void;
  onOpenFAQ: () => void;
}) {
  const { t } = useLingui();
  return (
    <AboutActionGrid
      title={t({ id: "settings.about.setup", message: "Setup & help" })}
    >
      <HoldActionCardButton
        onConfirm={props.onRestartOnboarding}
        accentPreset="accent"
        title={t({
          id: "settings.about.restart_onboarding",
          message: "Restart Onboarding",
        })}
        description={t({
          id: "settings.about.restart_onboarding_description",
          message: "hold to re-run setup experience",
        })}
        ariaLabel={t({
          id: "settings.about.restart_onboarding_hold_aria",
          message: "Restart Onboarding. Hold to confirm.",
        })}
        icon={<RotateCcw size={14} strokeWidth={2} />}
      />
      <ActionCardButton
        onClick={props.onOpenFAQ}
        title={t({ id: "settings.about.faq_help", message: "FAQ & Help" })}
        description={t({
          id: "settings.about.faq_help_description",
          message: "common questions",
        })}
        icon={<HelpCircle size={14} strokeWidth={2} />}
        accentPreset="cloud"
      />
    </AboutActionGrid>
  );
}

type AboutCliProps = {
  status: CliInstallStatus | null;
  busy: boolean;
  activeAccess: boolean;
  onInstall: () => void;
  onRemove: () => void;
};

export function AboutCli(props: AboutCliProps) {
  const { t } = useLingui();
  const state = classifyCli(props.status, props.activeAccess);
  const path = props.status?.installPath ?? "~/.local/bin/looper";
  return (
    <AboutActionGrid
      title={t({ id: "settings.about.advanced", message: "Advanced" })}
    >
      <CliCommandCard
        state={state}
        status={props.status}
        copy={cliCopy(state, props.status, path, t)}
        busy={props.busy}
        onInstall={props.onInstall}
        onRemove={props.onRemove}
      />
    </AboutActionGrid>
  );
}

function AboutActionGrid({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={ABOUT_STYLE.section}>
      <SectionLabel>{title}</SectionLabel>
      <div className={ABOUT_STYLE.grid}>{children}</div>
    </section>
  );
}

type CliCopy = { info: string; subtitle: string };

type CliCommandCardProps = {
  state: CliState;
  status: CliInstallStatus | null;
  copy: CliCopy;
  busy: boolean;
  onInstall: () => void;
  onRemove: () => void;
};

function CliCommandCard(props: CliCommandCardProps) {
  return (
    <div className={ABOUT_STYLE.card}>
      <div className={ABOUT_STYLE.cardRow}>
        <span className={ABOUT_STYLE.terminal}>
          <Terminal size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className={ABOUT_STYLE.cardContent}>
          <CliCommandHeader {...props} />
          <p className={ABOUT_STYLE.subtitle}>{props.copy.subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function CliCommandHeader(props: CliCommandCardProps) {
  const { t } = useLingui();
  return (
    <div className={ABOUT_STYLE.commandRow}>
      <span className={ABOUT_STYLE.commandTitle}>
        {t({ id: "settings.about.command_line", message: "Command line" })}
      </span>
      <CliInformation copy={props.copy.info} />
      <CliAction {...props} />
    </div>
  );
}

function CliInformation({ copy }: { copy: string }) {
  const { t } = useLingui();
  return (
    <div className={ABOUT_STYLE.infoAnchor}>
      <button
        type="button"
        className={ABOUT_STYLE.infoButton}
        aria-label={t({
          id: "settings.about.command_line.info_aria",
          message: "More information about command line tools",
        })}
      >
        <Info size={10} aria-hidden="true" />
      </button>
      <div className={ABOUT_STYLE.tooltipAnchor}>
        <div className={ABOUT_STYLE.tooltip}>{copy}</div>
      </div>
    </div>
  );
}

function CliAction(props: CliCommandCardProps) {
  const { t } = useLingui();
  const installed = props.status?.installed ?? false;
  const managed = props.status?.managedByApp ?? false;
  const disabled =
    props.busy ||
    props.state === "unavailable" ||
    props.state === "locked" ||
    props.state === "external";
  return (
    <button
      type="button"
      onClick={installed && managed ? props.onRemove : props.onInstall}
      disabled={disabled}
      className={ABOUT_STYLE.action}
    >
      {props.busy && <Loader2 size={10} className="animate-spin" />}
      {installed && managed
        ? t({ id: "settings.about.uninstall_cli", message: "Uninstall" })
        : installed
          ? t({
              id: "settings.about.cli.installed_action",
              message: "Installed",
            })
          : t({ id: "settings.about.install_cli", message: "Install CLI" })}
    </button>
  );
}

function cliCopy(
  state: CliState,
  status: CliInstallStatus | null,
  path: string,
  t: ReturnType<typeof useLingui>["t"],
): CliCopy {
  const command = status?.command ?? "looper";
  switch (state) {
    case "unavailable":
      return {
        info: t({
          id: "settings.about.cli.unavailable_info",
          message: "This build does not include the command line helper.",
        }),
        subtitle: t({
          id: "settings.about.cli.unavailable_subtitle",
          message: "Not available in this build",
        }),
      };
    case "locked":
      return {
        info: t({
          id: "settings.about.cli.locked_info",
          message: "Command line install requires a full active license.",
        }),
        subtitle: t({
          id: "settings.about.cli.locked_subtitle",
          message: "Requires a full active license",
        }),
      };
    case "external":
      return {
        info: t({
          id: "settings.about.cli.externally_managed_info",
          message: `The looper command is installed at ${path} and managed outside Looper. Use its package manager to update or remove it.`,
        }),
        subtitle: t({
          id: "settings.about.cli.installed_subtitle",
          message: `Installed at ${path}`,
        }),
      };
    case "managed":
      return {
        info: t({
          id: "settings.about.cli.installed_info",
          message: `The looper command is installed at ${path}. Use it from Terminal, scripts, or automation tools to call Looper without opening the app UI.`,
        }),
        subtitle: t({
          id: "settings.about.cli.installed_subtitle",
          message: `Installed at ${path}`,
        }),
      };
    case "path-missing":
      return {
        info: t({
          id: "settings.about.cli.path_missing_info",
          message: `Installs ${command} to ${path}. That folder is not currently on your shell PATH, so you may need to call it by full path or update your shell profile.`,
        }),
        subtitle: t({
          id: "settings.about.cli.default_subtitle",
          message: "Use Looper from Terminal or scripts",
        }),
      };
    case "available":
      return {
        info: t({
          id: "settings.about.cli.default_info",
          message: `Installs the ${command} command for Terminal, scripts, and automation tools. Use it when you want to call Looper programmatically without opening the app UI.`,
        }),
        subtitle: t({
          id: "settings.about.cli.default_subtitle",
          message: "Use Looper from Terminal or scripts",
        }),
      };
  }
}

async function restartSetup() {
  try {
    await resetOnboarding();
    window.location.reload();
  } catch (error) {
    console.error("Failed to restart onboarding:", error);
  }
}

function showLogs() {
  void revealLogs().catch(() => {});
}

export default AboutTab;
