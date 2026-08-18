#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const evidencePath = join(evidenceDir, "desktop-native-local-gate.txt");

mkdirSync(evidenceDir, { recursive: true });

const result = spawnSync(
  "cargo",
  ["test", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml", "--lib"],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  },
);

const combinedOutput = `${result.stdout}\n${result.stderr}`;
const sections = [
  "Gate: Desktop native Rust local QA",
  `Date: ${new Date().toISOString()}`,
  "Command: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib",
  "Scope: Tauri/Rust native contracts for hotkeys, pill, insertion gating, speech settings and host insertion smoke harness.",
  "",
  `Exit code: ${result.status ?? "signal"}`,
  "",
];

if (result.stdout.trim().length > 0) {
  sections.push("stdout:", "```text", result.stdout.trim(), "```", "");
}
if (result.stderr.trim().length > 0) {
  sections.push("stderr:", "```text", result.stderr.trim(), "```", "");
}
if (result.error) {
  sections.push(`Error: ${result.error.message}`, "");
}

const expectedIgnoredTests = [
  "host_insertion_smoke_in_textedit",
  "two_hour_capture_stream_stays_under_memory_budget",
];
const passed =
  !result.error &&
  result.status === 0 &&
  /test result: ok\. \d+ passed; 0 failed; \d+ ignored/.test(combinedOutput) &&
  expectedIgnoredTests.every((testName) =>
    combinedOutput.includes(`${testName} ... ignored`),
  );

sections.push(
  "## Result",
  "",
  passed ? "- PASS." : "- FAIL.",
  "",
  "Remaining gap:",
  "- The normal Rust suite ignores host_insertion_smoke_in_textedit.",
  "- Host-level insertion still requires the explicit env-gated TextEdit smoke with macOS Accessibility/Input Monitoring permissions.",
  "- The normal Rust suite ignores two_hour_capture_stream_stays_under_memory_budget because it writes a 230 MB WAV.",
  "- Meeting QA must execute the two-hour test explicitly before release.",
);

writeFileSync(evidencePath, `${sections.join("\n")}\n`);

if (!passed) {
  console.error(`Desktop native Rust local QA failed. Evidence: ${evidencePath}`);
  process.exit(1);
}

console.log(`Desktop native Rust local QA passed. Evidence: ${evidencePath}`);
