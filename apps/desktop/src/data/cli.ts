import { invoke } from "@tauri-apps/api/core";

import type { CliInstallStatus } from "../types";

export const getCliInstallStatus = () =>
  invoke<CliInstallStatus>("get_cli_install_status");

export const installCli = () => invoke<CliInstallStatus>("install_cli");

export const removeCli = () => invoke<CliInstallStatus>("remove_cli");
