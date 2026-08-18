#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const textEvidencePath = join(evidenceDir, "external-readiness-audit.txt");
const jsonEvidencePath = join(evidenceDir, "external-readiness-audit.json");

const gates = [
  {
    id: "resend-email-otp-real",
    label: "Resend email OTP real",
    script: "qa:external-resend-real",
    releaseEvidence: [".tcompound/evidence/release/resend-email-otp-real.*"],
    requiredEnv: ["OTP_EMAIL"],
    requiredAnyEnv: ["OTP_CODE", "RESEND_OTP_CODE"],
    proof: "Request OTP entrega email real; verify OTP devuelve token y refresh token.",
    requiresMockModeFalse: true,
  },
  {
    id: "oauth-google-real",
    label: "OAuth Google real",
    script: "qa:external-oauth-real",
    releaseEvidence: [".tcompound/evidence/release/oauth-google-code-exchange.*"],
    requiredEnv: ["OAUTH_PROVIDER", "OAUTH_CODE"],
    expectedEnv: { OAUTH_PROVIDER: "google" },
    proof:
      "Browser OAuth vuelve con code y qa:external-oauth-real emite token + refresh token.",
    requiresMockModeFalse: true,
  },
  {
    id: "oauth-apple-real",
    label: "OAuth Apple real",
    script: "qa:external-oauth-real",
    releaseEvidence: [".tcompound/evidence/release/oauth-apple-code-exchange.*"],
    requiredEnv: ["OAUTH_PROVIDER", "OAUTH_CODE"],
    expectedEnv: { OAUTH_PROVIDER: "apple" },
    proof:
      "Apple Sign-In vuelve con code y qa:external-oauth-real emite token + refresh token.",
    requiresMockModeFalse: true,
  },
  {
    id: "stt-real-harvard",
    label: "STT real con Harvard",
    script: "qa:external-stt-real",
    releaseEvidence: [".tcompound/evidence/release/stt-real-harvard.*"],
    requiredEnv: ["STT_PROVIDER"],
    requiredAnyEnv: ["CONVEX_AUTH_TOKEN", "E2E_CONVEX_AUTH_TOKEN"],
    proof:
      "MOCK_MODE=false y harvard.wav produce transcript real que matchea stale|smell|beer|heat|odor|pickle|ham, no transcript mock.",
    requiresMockModeFalse: true,
  },
  {
    id: "llm-real-cleanup",
    label: "LLM real / cleanup",
    script: "qa:external-llm-real",
    releaseEvidence: [".tcompound/evidence/release/llm-real-cleanup.*"],
    requiredEnv: ["LLM_PROVIDER"],
    requiredAnyEnv: ["CONVEX_AUTH_TOKEN", "E2E_CONVEX_AUTH_TOKEN"],
    proof:
      "MOCK_MODE=false y el protocolo agent/threads + agent/messages devuelve cleanup real, preserva friday,site visit,installer,schedule y no devuelve raw:.",
    requiresMockModeFalse: true,
  },
  {
    id: "revenuecat-subscriber-sync",
    label: "RevenueCat subscriber sync",
    script: "qa:external-revenuecat",
    releaseEvidence: [".tcompound/evidence/release/revenuecat-subscriber-sync.*"],
    requiredEnv: ["E2E_REVENUECAT_APP_USER_ID"],
    requiredAnyEnv: ["CONVEX_AUTH_TOKEN", "E2E_CONVEX_AUTH_TOKEN"],
    proof:
      "RevenueCat devuelve entitlements activos y mySubscription queda source=revenuecat, status=active y tier pro/ultra.",
  },
  {
    id: "store-play-purchase-restore-ios",
    label: "Store/Play purchase restore iOS",
    script: "qa:external-store-play-purchase",
    releaseEvidence: [".tcompound/evidence/release/store-play-purchase-restore-ios.*"],
    requiredEnv: [
      "STORE_PLAY_PLATFORM",
      "STORE_PLAY_PURCHASE_RESULT",
      "STORE_PLAY_PURCHASE_EVIDENCE",
      "STORE_PLAY_PURCHASE_NOTES",
    ],
    expectedEnv: { STORE_PLAY_PLATFORM: "ios", STORE_PLAY_PURCHASE_RESULT: "pass" },
    proof:
      "Compra y restore iOS cambian entitlement y mySubscription queda consistente.",
  },
  {
    id: "store-play-purchase-restore-android",
    label: "Store/Play purchase restore Android",
    script: "qa:external-store-play-purchase",
    releaseEvidence: [".tcompound/evidence/release/store-play-purchase-restore-android.*"],
    requiredEnv: [
      "STORE_PLAY_PLATFORM",
      "STORE_PLAY_PURCHASE_RESULT",
      "STORE_PLAY_PURCHASE_EVIDENCE",
      "STORE_PLAY_PURCHASE_NOTES",
    ],
    expectedEnv: { STORE_PLAY_PLATFORM: "android", STORE_PLAY_PURCHASE_RESULT: "pass" },
    proof:
      "Compra y restore Android cambian entitlement y mySubscription queda consistente.",
  },
  {
    id: "desktop-host-insertion",
    label: "Desktop host insertion",
    script: "qa:external-desktop-host",
    releaseEvidence: [".tcompound/evidence/release/desktop-host-insertion.*"],
    requiredEnv: ["LOOPER_HOST_INSERTION_SMOKE"],
    expectedEnv: { LOOPER_HOST_INSERTION_SMOKE: "1" },
    proof: "Smoke inserta texto en TextEdit con Accessibility/Input Monitoring concedidos.",
  },
  {
    id: "desktop-hotkey-pill-host-level",
    label: "Desktop hotkey/pill host-level",
    script: "qa:external-desktop-hotkey-pill",
    releaseEvidence: [".tcompound/evidence/release/desktop-hotkey-pill-host-level.*"],
    requiredEnv: [
      "LOOPER_DESKTOP_HOTKEY_PILL_SMOKE",
      "DESKTOP_HOTKEY_PILL_RESULT",
      "DESKTOP_HOTKEY_PILL_EVIDENCE",
      "DESKTOP_HOTKEY_PILL_NOTES",
    ],
    expectedEnv: {
      LOOPER_DESKTOP_HOTKEY_PILL_SMOKE: "1",
      DESKTOP_HOTKEY_PILL_RESULT: "pass",
    },
    proof:
      "Hotkey real en macOS abre/cambia estados del pill de la app desktop con permisos concedidos.",
  },
  {
    id: "desktop-remote-dictation-host-level",
    label: "Desktop remote dictation host-level",
    script: "qa:external-desktop-remote-dictation",
    releaseEvidence: [".tcompound/evidence/release/desktop-remote-dictation-host-level.*"],
    requiredEnv: [
      "LOOPER_DESKTOP_REMOTE_DICTATION_SMOKE",
      "DESKTOP_REMOTE_DICTATION_RESULT",
      "DESKTOP_REMOTE_DICTATION_EVIDENCE",
      "DESKTOP_REMOTE_DICTATION_NOTES",
    ],
    expectedEnv: {
      LOOPER_DESKTOP_REMOTE_DICTATION_SMOKE: "1",
      DESKTOP_REMOTE_DICTATION_RESULT: "pass",
    },
    proof: "Mobile dicta, desktop real inserta en app host y hace ack.",
  },
];

function envPresent(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function envMatches(name, expected) {
  return process.env[name] === expected;
}

function envAllowed(name, allowed) {
  return allowed.includes(process.env[name]);
}

function releaseEvidenceFiles(patterns) {
  return patterns.flatMap((pattern) => {
    const slash = pattern.lastIndexOf("/");
    const directory = join(root, pattern.slice(0, slash));
    const filenamePattern = pattern.slice(slash + 1);
    if (!existsSync(directory) || !filenamePattern.endsWith("*")) return [];
    const prefix = filenamePattern.slice(0, -1);
    return readdirSync(directory)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .map((name) => join(directory, name));
  });
}

function releaseEvidenceStatus(patterns) {
  const files = releaseEvidenceFiles(patterns);
  const parsed = files.flatMap((path) => {
    try {
      return [{ path, payload: JSON.parse(readFileSync(path, "utf8")) }];
    } catch {
      return [];
    }
  });
  const passed = parsed.find(({ payload }) => payload?.ok === true);
  if (passed) return { status: "passed", path: passed.path };
  const failed = parsed.find(({ payload }) => payload?.ok === false);
  if (failed) return { status: "failed", path: failed.path };
  return { status: "not-proven", path: null };
}

export { gates };

function readinessResults() {
  return gates.map((gate) => {
    const missingEnv = (gate.requiredEnv ?? [])
      .filter((name) => !envPresent(name))
      .map((name) =>
        gate.allowedEnv?.[name] !== undefined
          ? `${name}=${gate.allowedEnv[name].join("|")}`
          : gate.expectedEnv?.[name] === undefined
            ? name
            : `${name}=${gate.expectedEnv[name]}`,
      );
    const missingAnyEnv =
      gate.requiredAnyEnv?.some((name) => envPresent(name)) === false
        ? [gate.requiredAnyEnv.join("|")]
        : [];
    const mismatchedEnv = Object.entries(gate.expectedEnv ?? {})
      .filter(([name, expected]) => envPresent(name) && !envMatches(name, expected))
      .map(([name, expected]) => `${name}=${expected}`);
    const disallowedEnv = Object.entries(gate.allowedEnv ?? {})
      .filter(([name, allowed]) => envPresent(name) && !envAllowed(name, allowed))
      .map(([name, allowed]) => `${name}=${allowed.join("|")}`);
    const mockModeBlocks =
      gate.requiresMockModeFalse && process.env.MOCK_MODE !== "false" ? ["MOCK_MODE=false"] : [];
    const missing = [
      ...missingEnv,
      ...missingAnyEnv,
      ...mismatchedEnv,
      ...disallowedEnv,
      ...mockModeBlocks,
    ];
    const release = releaseEvidenceStatus(gate.releaseEvidence);

    return {
      id: gate.id,
      label: gate.label,
      status: missing.length === 0 ? "ready-for-live-proof" : "blocked/ext",
      releaseStatus: release.status,
      releaseEvidencePath: release.path,
      missing,
      proof: gate.proof,
      script: gate.script,
      releaseEvidence: gate.releaseEvidence,
    };
  });
}

function main() {
  const results = readinessResults();

  mkdirSync(evidenceDir, { recursive: true });

  const lines = [
    "Gate: External release readiness audit",
    `Date: ${new Date().toISOString()}`,
    "",
    "This audit checks whether the current shell environment is ready to run live external/provider gates.",
    "It does not call providers and does not mark release gates as passed.",
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.label}`);
    lines.push(`Environment status: ${result.status}`);
    lines.push(`Release evidence status: ${result.releaseStatus}`);
    if (result.releaseEvidencePath) {
      lines.push(`Release evidence found: ${result.releaseEvidencePath}`);
    }
    lines.push(`Missing: ${result.missing.length > 0 ? result.missing.join(", ") : "none"}`);
    lines.push(`Required proof: ${result.proof}`);
    lines.push(`Runner: pnpm run ${result.script}`);
    lines.push(`Release evidence: ${result.releaseEvidence.join(", ")}`);
    lines.push("");
  }

  writeFileSync(textEvidencePath, `${lines.join("\n")}\n`);
  writeFileSync(
    jsonEvidencePath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
  );

  const blockedCount = results.filter((result) => result.status === "blocked/ext").length;
  const passedEvidenceCount = results.filter((result) => result.releaseStatus === "passed").length;
  console.log(
    `External readiness audit wrote ${textEvidencePath} (${blockedCount} environment-blocked gates; ${passedEvidenceCount} release-evidence passes).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
