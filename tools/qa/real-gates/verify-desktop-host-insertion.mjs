#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { requiredEnv, root, writeEvidence } from "./convex-http.mjs";

const gate = "Desktop host insertion";
const command = "cargo";
const args = [
  "test",
  "--manifest-path",
  "apps/desktop/src-tauri/Cargo.toml",
  "--lib",
  "host_insertion_smoke",
  "--",
  "--ignored",
  "--nocapture",
];

try {
  await main();
} catch (error) {
  console.error(
    `Release gate failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

async function main() {
  const enabled = requiredEnv("LOOPER_HOST_INSERTION_SMOKE");
  if (enabled !== "1") {
    throw new Error(
      "Set LOOPER_HOST_INSERTION_SMOKE=1 to run the TextEdit host insertion gate.",
    );
  }
  if (process.platform !== "darwin") {
    throw new Error("Desktop host insertion gate is macOS-only because it uses TextEdit + AX.");
  }

  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, LOOPER_HOST_INSERTION_SMOKE: "1" },
  });
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const combined = `${stdout}\n${stderr}`;
  const noFocusedTextEditSnapshot = combined.includes("No focused TextEdit snapshot");
  const testPassed =
    result.status === 0 &&
    combined.includes("host_insertion_smoke_in_textedit") &&
    combined.includes("test result: ok");
  // The ignored smoke can return Ok after recording that AX could not see a
  // focused TextEdit element. That is a useful diagnostic, never a release
  // pass, so the runner must reject it explicitly.
  const ok = testPassed && !noFocusedTextEditSnapshot;

  const evidence = {
    ok,
    gate,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    command: `${command} ${args.join(" ")}`,
    workingDirectory: root,
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
    stdout,
    stderr,
    failureClass: ok
      ? null
      : noFocusedTextEditSnapshot
        ? "macos-permission-or-focus"
        : "cargo-host-smoke-failure",
    nextActions: ok
      ? []
      : noFocusedTextEditSnapshot
        ? [
            "Grant Accessibility to the terminal/Codex process that launches cargo.",
            "Grant Input Monitoring to the same process if macOS prompts for keystroke automation.",
            "Ensure TextEdit can open a new document and receive focus, then rerun LOOPER_HOST_INSERTION_SMOKE=1 pnpm run qa:external-desktop-host.",
          ]
        : [
            "Inspect stdout/stderr in this evidence file.",
            "Rerun with LOOPER_HOST_INSERTION_SMOKE=1 after fixing the cargo smoke failure.",
          ],
    evidenceMeaning: ok
      ? "TextEdit host insertion smoke passed with macOS Accessibility/Input Monitoring available."
      : "TextEdit host insertion smoke did not pass; this does not close the release gate.",
  };
  const paths = writeEvidence("desktop-host-insertion", evidence);
  if (!ok) {
    const hint = noFocusedTextEditSnapshot
      ? "No focused TextEdit snapshot. Grant Accessibility/Input Monitoring to the test process."
      : "Cargo smoke failed; inspect release evidence for stdout/stderr.";
    throw new Error(`${hint} Evidence: ${paths.textPath}`);
  }
  console.log(JSON.stringify({ ...evidence, evidence: paths }, null, 2));
}
