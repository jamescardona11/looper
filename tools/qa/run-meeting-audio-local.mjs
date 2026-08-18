#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const evidencePath = join(evidenceDir, "meeting-audio-automated.txt");

mkdirSync(evidenceDir, { recursive: true });

const checks = [
  {
    name: "Frontend behavior",
    command: "pnpm",
    args: ["--filter", "looper-desktop", "test"],
  },
  {
    name: "Desktop typecheck and webview build",
    command: "pnpm",
    args: ["--filter", "looper-desktop", "build"],
  },
  {
    name: "Native Rust contracts",
    command: "pnpm",
    args: ["run", "qa:desktop-native"],
  },
];

if (process.platform === "darwin") {
  checks.push({
    name: "Two-hour bounded-memory capture",
    command: "cargo",
    args: [
      "test",
      "--manifest-path",
      "apps/desktop/src-tauri/Cargo.toml",
      "--lib",
      "library::meeting_capture::tests::two_hour_capture_stream_stays_under_memory_budget",
      "--",
      "--ignored",
      "--exact",
      "--nocapture",
    ],
  });
}

const report = [
  "# Meeting audio automated QA",
  "",
  `Date: ${new Date().toISOString()}`,
  `Platform: ${process.platform}`,
  "",
];
let passed = true;

for (const check of checks) {
  const commandLine = [check.command, ...check.args].join(" ");
  const result = spawnSync(check.command, check.args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const ok = !result.error && result.status === 0;
  passed &&= ok;
  report.push(
    `## ${check.name}`,
    "",
    `Command: ${commandLine}`,
    `Result: ${ok ? "PASS" : "FAIL"}`,
    `Exit code: ${result.status ?? "signal"}`,
    "",
  );
  if (result.stdout.trim()) {
    report.push("stdout:", "```text", result.stdout.trim(), "```", "");
  }
  if (result.stderr.trim()) {
    report.push("stderr:", "```text", result.stderr.trim(), "```", "");
  }
  if (result.error) report.push(`Error: ${result.error.message}`, "");
  if (!ok) break;
}

report.push("## Result", "", passed ? "- PASS" : "- FAIL", "");
writeFileSync(evidencePath, `${report.join("\n")}\n`);

if (!passed) {
  console.error(`Meeting audio QA failed. Evidence: ${evidencePath}`);
  process.exit(1);
}

console.log(`Meeting audio QA passed. Evidence: ${evidencePath}`);
