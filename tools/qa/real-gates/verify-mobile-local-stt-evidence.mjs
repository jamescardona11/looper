#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requiredEnv, root, writeEvidence } from "./convex-http.mjs";

const minimumRuns = 100;
const finalP95Limits = { ios: 1500, android: 2000 };
const forbiddenKey = /audio|transcript|prompt|dictionary|clipboard|selection/i;

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const inputs = [
    {
      platform: "ios",
      path: requiredEnv("MOBILE_LOCAL_STT_IOS_EVIDENCE"),
      expectedModel: requiredEnv("MOBILE_LOCAL_STT_IOS_MIN_MODEL"),
    },
    {
      platform: "android",
      path: requiredEnv("MOBILE_LOCAL_STT_ANDROID_EVIDENCE"),
      expectedModel: requiredEnv("MOBILE_LOCAL_STT_ANDROID_MIN_MODEL"),
    },
  ];

  const reports = inputs.map(({ platform, path, expectedModel }) => {
    const absolutePath = resolve(root, path);
    let report;
    try {
      report = JSON.parse(readFileSync(absolutePath, "utf8"));
    } catch (error) {
      throw new Error(`Could not read ${platform} evidence at ${absolutePath}: ${error}`);
    }
    return validateReport({ platform, absolutePath, expectedModel, report });
  });

  const evidence = {
    ok: true,
    gate: "Mobile Local STT physical-device endurance",
    generatedAt: new Date().toISOString(),
    reports,
    evidenceMeaning:
      "Physical minimum-device evidence completed at least 100 local dictations per platform with no fallback, errors, memory termination, private text/audio fields, or p95 regression.",
  };
  const paths = writeEvidence("mobile-local-stt-physical", evidence);
  console.log(JSON.stringify({ ...evidence, evidence: paths }, null, 2));
}

function validateReport({ platform, absolutePath, expectedModel, report }) {
  if (report?.schemaVersion !== 1) {
    throw new Error(`${platform} evidence uses an unsupported schema version.`);
  }
  if (report.platform !== platform) {
    throw new Error(`${platform} evidence declares platform=${report.platform}.`);
  }
  if (report.isPhysicalDevice !== true) {
    throw new Error(`${platform} evidence came from a simulator/emulator.`);
  }
  if (report.deviceModel !== expectedModel) {
    throw new Error(
      `${platform} evidence device ${report.deviceModel} does not match minimum model ${expectedModel}.`,
    );
  }
  assertNoPrivatePayload(report);
  if (!Array.isArray(report.samples) || report.samples.length < minimumRuns) {
    throw new Error(`${platform} evidence must contain at least ${minimumRuns} runs.`);
  }
  if (report.fixtureDurationMs < 9500 || report.fixtureDurationMs > 10500) {
    throw new Error(`${platform} evidence must use a 10-second fixture.`);
  }

  const successfulFinalTimes = [];
  let peakMemoryBytes = 0;
  for (const [index, sample] of report.samples.entries()) {
    for (const field of ["timeToFirstTextMs", "finalTimeMs", "peakMemoryBytes"]) {
      if (!Number.isFinite(sample[field]) || sample[field] < 0) {
        throw new Error(`${platform} sample ${index + 1} has invalid ${field}.`);
      }
    }
    if (sample.fallback === true) {
      throw new Error(`${platform} sample ${index + 1} used fallback.`);
    }
    if (sample.errorCode != null) {
      throw new Error(`${platform} sample ${index + 1} failed with ${sample.errorCode}.`);
    }
    if (sample.memoryTermination === true) {
      throw new Error(`${platform} sample ${index + 1} ended for memory pressure.`);
    }
    successfulFinalTimes.push(sample.finalTimeMs);
    peakMemoryBytes = Math.max(peakMemoryBytes, sample.peakMemoryBytes);
  }

  const totalMemoryBytes = Number(report.totalMemoryBytes);
  if (!Number.isFinite(totalMemoryBytes) || totalMemoryBytes <= 0) {
    throw new Error(`${platform} evidence is missing total device memory.`);
  }
  if (peakMemoryBytes >= totalMemoryBytes * 0.85) {
    throw new Error(`${platform} peak memory leaves less than 15% device headroom.`);
  }
  const finalP95Ms = percentile95(successfulFinalTimes);
  if (finalP95Ms > finalP95Limits[platform]) {
    throw new Error(
      `${platform} warm finalization p95 ${finalP95Ms}ms exceeds ${finalP95Limits[platform]}ms.`,
    );
  }

  return {
    platform,
    path: absolutePath,
    deviceModel: report.deviceModel,
    osVersion: report.osVersion,
    runs: report.samples.length,
    finalP95Ms,
    peakMemoryBytes,
    totalMemoryBytes,
  };
}

function assertNoPrivatePayload(value, path = "report") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPrivatePayload(entry, `${path}[${index}]`));
    return;
  }
  if (value == null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKey.test(key)) {
      throw new Error(`Private payload field is forbidden in evidence: ${path}.${key}`);
    }
    assertNoPrivatePayload(nested, `${path}.${key}`);
  }
}

function percentile95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}
