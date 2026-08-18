import fs from "node:fs";
import path from "node:path";

export function iconOutputDirectory(args, cwd) {
  const option = args.findIndex(
    (value) => value === "--output" || value === "-o",
  );
  if (option >= 0 && args[option + 1]) {
    return path.resolve(cwd, args[option + 1]);
  }

  const inline = args.find((value) => value.startsWith("--output="));
  return inline
    ? path.resolve(cwd, inline.slice("--output=".length))
    : path.join(cwd, "src-tauri", "icons");
}

export function isIconGeneration(args) {
  return (
    args[0] === "icon" &&
    !args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))
  );
}

export function removeMobileIconDirectories(args, cwd) {
  const root = iconOutputDirectory(args, cwd);
  for (const platform of ["android", "ios"]) {
    fs.rmSync(path.join(root, platform), { recursive: true, force: true });
  }
}
