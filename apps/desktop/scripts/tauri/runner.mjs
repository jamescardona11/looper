import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function runTauri({
  args,
  cli,
  env,
  locateVsDevCommand,
  quoteArgument,
  command,
}) {
  const nativeBuild = args[0] === "dev" || args[0] === "build";
  const onWindows = process.platform === "win32";
  const vsDevCommand = onWindows ? locateVsDevCommand(env) : undefined;

  if (onWindows && !vsDevCommand && nativeBuild) {
    console.warn(
      "Looper: VsDevCmd.bat not found. Install Visual Studio 2022 (Desktop development with C++) or Build Tools, or set VSDEVCMD_PATH.",
    );
  }

  if (onWindows && vsDevCommand && nativeBuild) {
    const invocation = [
      quoteArgument(process.execPath),
      quoteArgument(cli),
      ...args.map(quoteArgument),
    ].join(" ");
    const batchFile = path.join(env.CARGO_TARGET_DIR, "looper-tauri.cmd");
    const batch = [
      "@echo off",
      "setlocal EnableExtensions DisableDelayedExpansion",
      `call ${quoteArgument(vsDevCommand)} -no_logo`,
      `set \"CARGO_TARGET_DIR=${env.CARGO_TARGET_DIR}\"`,
      `set \"TEMP=${env.TEMP}\"`,
      `set \"TMP=${env.TMP}\"`,
      invocation,
      "",
    ].join("\r\n");
    fs.writeFileSync(batchFile, batch);
    return spawn(command(), ["/d", "/c", batchFile], {
      env,
      stdio: "inherit",
      shell: false,
    });
  }

  return spawn(process.execPath, [cli, ...args], {
    env,
    stdio: "inherit",
  });
}
