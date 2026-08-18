#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { requiredEnv, root, writeEvidence } from "./convex-http.mjs";

const gate = "Desktop hotkey/pill host-level";

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const enabled = requiredEnv("LOOPER_DESKTOP_HOTKEY_PILL_SMOKE");
  if (enabled !== "1") {
    throw new Error("Set LOOPER_DESKTOP_HOTKEY_PILL_SMOKE=1 after running the manual host-level pass.");
  }
  if (process.platform !== "darwin") {
    throw new Error("Desktop hotkey/pill host-level gate is macOS-only.");
  }

  const result = requiredEnv("DESKTOP_HOTKEY_PILL_RESULT").toLowerCase();
  if (result !== "pass") {
    throw new Error("DESKTOP_HOTKEY_PILL_RESULT must be pass to close this release gate.");
  }

  const evidencePaths = requiredEnv("DESKTOP_HOTKEY_PILL_EVIDENCE")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(root, entry));
  if (evidencePaths.length === 0) {
    throw new Error("DESKTOP_HOTKEY_PILL_EVIDENCE must list at least one log/screenshot/video path.");
  }

  const artifacts = evidencePaths.map((path) => {
    if (!existsSync(path)) {
      throw new Error(`Desktop hotkey/pill evidence file does not exist: ${path}`);
    }
    const stat = statSync(path);
    if (!stat.isFile()) {
      throw new Error(`Desktop hotkey/pill evidence path is not a file: ${path}`);
    }
    if (stat.size === 0) {
      throw new Error(`Desktop hotkey/pill evidence file is empty: ${path}`);
    }
    if (stat.size < 256) {
      throw new Error(`Desktop hotkey/pill evidence file is too small to prove a host-level pass: ${path}`);
    }
    return { path, bytes: stat.size };
  });

  const notes = requiredEnv("DESKTOP_HOTKEY_PILL_NOTES");
  const requiredNoteTokens = ["hotkey", "pill", "desktop", "state"];
  for (const token of requiredNoteTokens) {
    if (!notes.toLowerCase().includes(token)) {
      throw new Error(`DESKTOP_HOTKEY_PILL_NOTES must mention ${token}.`);
    }
  }
  if (!/(idle|listening|processing|cancel)/i.test(notes)) {
    throw new Error("DESKTOP_HOTKEY_PILL_NOTES must mention an observed pill state.");
  }

  const evidence = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    result,
    artifacts,
    notes,
    evidenceMeaning:
      "A manual macOS host-level pass verified that the real desktop hotkey drives visible pill state transitions. This runner only validates attached evidence and does not synthesize the UI interaction.",
  };
  const paths = writeEvidence("desktop-hotkey-pill-host-level", evidence);
  console.log(JSON.stringify({ ...evidence, evidence: paths }, null, 2));
}
