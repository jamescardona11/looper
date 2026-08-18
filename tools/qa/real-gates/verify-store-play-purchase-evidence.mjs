#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { requiredEnv, root, writeEvidence } from "./convex-http.mjs";

const gate = "Store/Play purchase restore";
const supportedPlatforms = new Set(["ios", "android"]);

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const platform = requiredEnv("STORE_PLAY_PLATFORM").toLowerCase();
  if (!supportedPlatforms.has(platform)) {
    throw new Error("STORE_PLAY_PLATFORM must be ios or android.");
  }

  const result = requiredEnv("STORE_PLAY_PURCHASE_RESULT").toLowerCase();
  if (result !== "pass") {
    throw new Error("STORE_PLAY_PURCHASE_RESULT must be pass to close this release gate.");
  }

  const evidencePaths = requiredEnv("STORE_PLAY_PURCHASE_EVIDENCE")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(root, entry));
  if (evidencePaths.length === 0) {
    throw new Error("STORE_PLAY_PURCHASE_EVIDENCE must list at least one log/screenshot/video path.");
  }

  const artifacts = evidencePaths.map((path) => {
    if (!existsSync(path)) {
      throw new Error(`Store/Play evidence file does not exist: ${path}`);
    }
    const stat = statSync(path);
    if (!stat.isFile()) {
      throw new Error(`Store/Play evidence path is not a file: ${path}`);
    }
    if (stat.size === 0) {
      throw new Error(`Store/Play evidence file is empty: ${path}`);
    }
    if (stat.size < 256) {
      throw new Error(`Store/Play evidence file is too small to prove a purchase/restore pass: ${path}`);
    }
    return { path, bytes: stat.size };
  });

  const notes = requiredEnv("STORE_PLAY_PURCHASE_NOTES");
  for (const token of ["purchase", "entitlement", "revenuecat", "mysubscription"]) {
    if (!notes.toLowerCase().includes(token)) {
      throw new Error(`STORE_PLAY_PURCHASE_NOTES must mention ${token}.`);
    }
  }
  if (!/restore/i.test(notes)) {
    throw new Error("STORE_PLAY_PURCHASE_NOTES must mention restore.");
  }
  if (!/subscription/i.test(notes)) {
    throw new Error("STORE_PLAY_PURCHASE_NOTES must mention subscription.");
  }

  const evidence = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    platform,
    result,
    artifacts,
    notes,
    evidenceMeaning:
      "A manual App Store / Play Billing sandbox pass verified purchase and restore changed RevenueCat entitlement and app subscription state. This runner validates attached evidence only.",
  };
  const paths = writeEvidence(`store-play-purchase-restore-${platform}`, evidence);
  console.log(JSON.stringify({ ...evidence, evidence: paths }, null, 2));
}
