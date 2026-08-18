#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertLocalBackendUrl,
  backendReady,
  ensureLocalAuthKeys,
  readBackendUrl,
  removeLocalAuthKeys,
  startConvex,
  stopProcess,
  waitForBackend,
} from "../e2e/run-local-e2e.mjs";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const evidencePath = join(evidenceDir, "remote-dictation-cross-client-pairing.txt");
const otpCode = process.env.OTP_CODE ?? process.env.MOCK_EMAIL_OTP_CODE ?? "57575757";

process.env.MOCK_MODE ??= "true";
process.env.MOCK_EMAIL_OTP_CODE ??= otpCode;

mkdirSync(evidenceDir, { recursive: true });

const sections = [
  "Gate: Remote dictation cross-client local pairing",
  `Date: ${new Date().toISOString()}`,
  "Scope: Remote dictation pairing across two separate Convex clients",
  "Command: pnpm run qa:remote-dictation-local",
  "Script: test-support/scripts/remote-dictation-pairing-smoke.mjs",
  "Auth: anonymous by default; set REMOTE_PAIRING_AUTH=email-otp for mock OTP coverage",
  "",
];

let convexProcess = null;
let convexUrl = null;
let ephemeralAuthKeys = false;
let failed = false;

function appendResult(label, result) {
  sections.push(`## ${label}`, "", `Exit code: ${result.status ?? "signal"}`, "");
  if (result.stdout.trim().length > 0) {
    sections.push("stdout:", "```text", result.stdout.trim(), "```", "");
  }
  if (result.stderr.trim().length > 0) {
    sections.push("stderr:", "```text", result.stderr.trim(), "```", "");
  }
  if (result.error) {
    sections.push(`Error: ${result.error.message}`, "");
  }
  if (result.error || result.status !== 0) failed = true;
}

try {
  convexUrl = readBackendUrl();
  if (convexUrl) {
    assertLocalBackendUrl(convexUrl, process.env.E2E_ALLOW_REMOTE === "true");
  }

  if (!convexUrl || !(await backendReady(convexUrl))) {
    sections.push("Starting the configured Convex development backend.", "");
    convexProcess = startConvex();
    convexUrl = await waitForBackend(convexProcess, convexUrl);
  } else {
    sections.push(`Reusing Convex backend at ${convexUrl}.`, "");
  }

  sections.push(
    "Backend requirement:",
    "- A backend spawned by this wrapper receives MOCK_MODE=true and MOCK_EMAIL_OTP_CODE.",
    "- The default anonymous pairing path does not require Resend or mock OTP.",
    "- If REMOTE_PAIRING_AUTH=email-otp reuses an already-running Convex backend, that backend must already have matching mock OTP env.",
    "- For a local backend, this wrapper provisions ephemeral JWT_PRIVATE_KEY/JWKS and removes them after the smoke; it never mutates a remote deployment.",
    "",
  );

  if (!failed) {
    ephemeralAuthKeys = ensureLocalAuthKeys();
    const pairingResult = spawnSync(
      "node",
      ["test-support/scripts/remote-dictation-pairing-smoke.mjs"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          CONVEX_URL: convexUrl,
          OTP_CODE: otpCode,
          OTP_EMAIL: `remote-pairing-${Date.now()}@looper.local`,
        },
      },
    );
    appendResult("Run cross-client pairing smoke", pairingResult);
  }
} catch (error) {
  failed = true;
  sections.push("Error:", "```text", error instanceof Error ? error.message : String(error), "```", "");
} finally {
  removeLocalAuthKeys(ephemeralAuthKeys);
  await stopProcess(convexProcess);
}

sections.push(
  "## Result",
  "",
  failed ? "- FAIL." : "- PASS.",
  "",
  "Remaining gap:",
  "- This proves cross-client identity/pairing and backend handoff.",
  "- It does not prove the real Tauri app window inserted into the focused macOS host field under system permissions.",
);

writeFileSync(evidencePath, `${sections.join("\n")}\n`);

if (failed) {
  console.error(`Remote dictation cross-client local pairing failed. Evidence: ${evidencePath}`);
  process.exit(1);
}

console.log(`Remote dictation cross-client local pairing passed. Evidence: ${evidencePath}`);
