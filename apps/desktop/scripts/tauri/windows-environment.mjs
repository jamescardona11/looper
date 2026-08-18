import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const windowsRoot = (cwd) => path.parse(cwd).root;

const defaultTarget = (cwd) =>
  path.join(windowsRoot(cwd), ".looper-cargo-target");

export function prepareWindowsEnvironment(env, cwd) {
  const target =
    env.CARGO_TARGET_DIR ??
    env.LOOPER_CARGO_TARGET_DIR ??
    (env.CI && env.RUNNER_TEMP
      ? path.join(env.RUNNER_TEMP, "cargo-target")
      : defaultTarget(cwd));

  env.CARGO_TARGET_DIR = target;
  fs.mkdirSync(target, { recursive: true });

  const temp = path.join(target, "tmp");
  fs.mkdirSync(temp, { recursive: true });
  env.TEMP = temp;
  env.TMP = temp;
}

const candidate = (root, year, edition) =>
  path.join(
    root,
    "Microsoft Visual Studio",
    year,
    edition,
    "Common7",
    "Tools",
    "VsDevCmd.bat",
  );

export function locateVsDevCommand(env) {
  if (env.VSDEVCMD_PATH && fs.existsSync(env.VSDEVCMD_PATH)) {
    return env.VSDEVCMD_PATH;
  }

  const installer = path.join(
    env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (fs.existsSync(installer)) {
    try {
      const installation = execFileSync(
        installer,
        [
          "-latest",
          "-products",
          "*",
          "-requires",
          "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
          "-property",
          "installationPath",
        ],
        { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      const selected = path.join(
        installation,
        "Common7",
        "Tools",
        "VsDevCmd.bat",
      );
      if (selected && fs.existsSync(selected)) return selected;
    } catch {
      // Search the conventional layouts when vswhere cannot resolve one.
    }
  }

  const roots = [
    env.ProgramFiles ?? "C:\\Program Files",
    env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
  ];
  for (const root of roots) {
    for (const year of ["18", "2022", "2019"]) {
      for (const edition of [
        "Community",
        "Professional",
        "Enterprise",
        "BuildTools",
      ]) {
        const selected = candidate(root, year, edition);
        if (fs.existsSync(selected)) return selected;
      }
    }
  }
  return undefined;
}

export const windowsCommand = () => "C:\\Windows\\System32\\cmd.exe";

export const quoteWindowsArgument = (value) => `"${value.replace(/"/g, '""')}"`;
