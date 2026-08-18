import { useLingui } from "@lingui/react/macro";
import {
  CircleNotch as Loader2,
  Info,
  TerminalWindow as Terminal,
} from "@phosphor-icons/react";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import type { CliInstallStatus } from "../../../../types";
import { classifyCli, type CliState } from "./about-tab-model";

type CliCopy = { info: string; subtitle: string };

export function AboutCli({
  status,
  busy,
  activeAccess,
  onInstall,
  onRemove,
}: {
  status: CliInstallStatus | null;
  busy: boolean;
  activeAccess: boolean;
  onInstall: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const state = classifyCli(status, activeAccess);
  const path = status?.installPath ?? "~/.local/bin/looper";
  const copy = cliCopy(state, status, path, t);
  const installed = status?.installed ?? false;
  const managed = status?.managedByApp ?? false;
  const disabled =
    busy ||
    state === "unavailable" ||
    state === "locked" ||
    state === "external";

  return (
    <section className="space-y-2">
      <SectionLabel>
        {t({ id: "settings.about.advanced", message: "Advanced" })}
      </SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-surface-surface p-2.5">
          <div className="flex min-h-[52px] gap-2.5 px-1 py-0.5">
            <span className="flex size-5 shrink-0 items-center justify-center self-center ui-color-muted">
              <Terminal size={14} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate ui-text-label-strong ui-color-primary">
                  {t({
                    id: "settings.about.command_line",
                    message: "Command line",
                  })}
                </span>
                <div className="group relative shrink-0">
                  <button
                    type="button"
                    className="flex size-4 items-center justify-center ui-color-disabled transition-colors hover:ui-color-muted focus:ui-color-muted focus:outline-none"
                    aria-label={t({
                      id: "settings.about.command_line.info_aria",
                      message: "More information about command line tools",
                    })}
                  >
                    <Info size={10} aria-hidden="true" />
                  </button>
                  <div className="absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 group-hover:block group-focus-within:block">
                    <div className="w-56 rounded-lg border border-border-secondary bg-surface-overlay px-2.5 py-1.5 leading-tight shadow-lg ui-text-micro ui-color-secondary">
                      {copy.info}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={installed && managed ? onRemove : onInstall}
                  disabled={disabled}
                  className="inline-flex h-6 min-w-[4.75rem] shrink-0 items-center justify-center gap-1 px-1 ui-text-button-sm ui-color-secondary transition-colors hover:text-content-primary disabled:pointer-events-none disabled:opacity-60"
                >
                  {busy && <Loader2 size={10} className="animate-spin" />}
                  {installed && managed
                    ? t({
                        id: "settings.about.uninstall_cli",
                        message: "Uninstall",
                      })
                    : installed
                      ? t({
                          id: "settings.about.cli.installed_action",
                          message: "Installed",
                        })
                      : t({
                          id: "settings.about.install_cli",
                          message: "Install CLI",
                        })}
                </button>
              </div>
              <p className="mt-1 truncate ui-text-meta ui-color-muted">
                {copy.subtitle}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
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
