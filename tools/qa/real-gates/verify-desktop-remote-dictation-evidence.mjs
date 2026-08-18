#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { requiredEnv, root, writeEvidence } from "./convex-http.mjs";

const gate = "Desktop remote dictation host-level";

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const enabled = requiredEnv("LOOPER_DESKTOP_REMOTE_DICTATION_SMOKE");
  if (enabled !== "1") {
    throw new Error("Set LOOPER_DESKTOP_REMOTE_DICTATION_SMOKE=1 after running the manual cross-device host-level pass.");
  }
  if (process.platform !== "darwin") {
    throw new Error("Desktop remote dictation host-level gate is macOS-only.");
  }

  const result = requiredEnv("DESKTOP_REMOTE_DICTATION_RESULT").toLowerCase();
  if (result !== "pass") {
    throw new Error("DESKTOP_REMOTE_DICTATION_RESULT must be pass to close this release gate.");
  }

  const evidencePaths = requiredEnv("DESKTOP_REMOTE_DICTATION_EVIDENCE")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(root, entry));
  if (evidencePaths.length === 0) {
    throw new Error("DESKTOP_REMOTE_DICTATION_EVIDENCE must list at least one log/screenshot/video path.");
  }

  const artifacts = evidencePaths.map((path) => {
    if (!existsSync(path)) {
      throw new Error(`Desktop remote dictation evidence file does not exist: ${path}`);
    }
    const stat = statSync(path);
    if (!stat.isFile()) {
      throw new Error(`Desktop remote dictation evidence path is not a file: ${path}`);
    }
    if (stat.size === 0) {
      throw new Error(`Desktop remote dictation evidence file is empty: ${path}`);
    }
    if (stat.size < 256) {
      throw new Error(`Desktop remote dictation evidence file is too small to prove a host-level pass: ${path}`);
    }
    return { path, bytes: stat.size };
  });

  const notes = requiredEnv("DESKTOP_REMOTE_DICTATION_NOTES");
  for (const token of ["mobile", "desktop", "host", "insert", "ack"]) {
    if (!notes.toLowerCase().includes(token)) {
      throw new Error(`DESKTOP_REMOTE_DICTATION_NOTES must mention ${token}.`);
    }
  }
  if (!/(focused|text field|textarea|TextEdit)/i.test(notes)) {
    throw new Error("DESKTOP_REMOTE_DICTATION_NOTES must identify the focused host field.");
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
      "A manual cross-device host-level pass verified mobile remote dictation reached the real desktop app, inserted into a focused host field, and was acknowledged/consumed. This runner validates attached evidence only.",
  };
  const paths = writeEvidence("desktop-remote-dictation-host-level", evidence);
  console.log(JSON.stringify({ ...evidence, evidence: paths }, null, 2));
}
