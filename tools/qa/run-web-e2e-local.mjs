#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const evidencePath = join(evidenceDir, "web-e2e-local-gate.txt");

mkdirSync(evidenceDir, { recursive: true });

const result = spawnSync("pnpm", ["run", "web:e2e"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

const sections = [
  "Gate: Web/Desktop local Playwright QA",
  `Date: ${new Date().toISOString()}`,
  "Command: pnpm run web:e2e",
  "Covers: transcribe-fixture.spec.ts, dictation-crud.spec.ts",
  "Fixture: test-support/fixtures/audio/harvard.wav",
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

const passed =
  !result.error &&
  result.status === 0 &&
  result.stdout.includes("2 passed") &&
  result.stdout.includes("transcribe-fixture.spec.ts") &&
  result.stdout.includes("dictation-crud.spec.ts");

sections.push("## Result", "", passed ? "- PASS." : "- FAIL.");

writeFileSync(evidencePath, `${sections.join("\n")}\n`);

if (!passed) {
  console.error(`Web/Desktop local Playwright QA failed. Evidence: ${evidencePath}`);
  process.exit(1);
}

console.log(`Web/Desktop local Playwright QA passed. Evidence: ${evidencePath}`);
