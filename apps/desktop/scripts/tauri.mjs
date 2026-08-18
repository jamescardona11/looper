// Workspace entrypoint for Tauri development, builds, and icon generation.
import { createRequire } from "node:module";
import process from "node:process";
import { configureMacQaSigning } from "./tauri-signing.mjs";
import {
  locateVsDevCommand,
  prepareWindowsEnvironment,
  quoteWindowsArgument,
  windowsCommand,
} from "./tauri/windows-environment.mjs";
import {
  isIconGeneration,
  removeMobileIconDirectories,
} from "./tauri/icons.mjs";
import { runTauri } from "./tauri/runner.mjs";

const require = createRequire(import.meta.url);
const cwd = process.cwd();
const args = process.argv.slice(2);
const env = { ...process.env };

if (process.platform === "win32") {
  prepareWindowsEnvironment(env, cwd);
}
configureMacQaSigning({ args, env, platform: process.platform });

const tauriCli = require.resolve("@tauri-apps/cli/tauri.js", {
  paths: [cwd, import.meta.dirname],
});

const child = runTauri({
  args,
  cli: tauriCli,
  env,
  locateVsDevCommand,
  quoteArgument: quoteWindowsArgument,
  command: windowsCommand,
});

child.on("error", (error) => {
  console.error(`Failed to spawn Tauri CLI at ${tauriCli}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if (code === 0 && isIconGeneration(args)) {
    removeMobileIconDirectories(args, cwd);
  }

  process.exit(code ?? 1);
});
