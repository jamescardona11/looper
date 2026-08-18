#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const textEvidencePath = join(evidenceDir, "project-convex-provider-readiness.txt");
const jsonEvidencePath = join(evidenceDir, "project-convex-provider-readiness.json");

loadEnvFile(process.env.PROJECT_CONVEX_ENV_FILE ?? "backend/.env");
if (!process.env.CONVEX_URL && process.env.VITE_CONVEX_URL) {
  process.env.CONVEX_URL = process.env.VITE_CONVEX_URL;
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  mkdirSync(evidenceDir, { recursive: true });
  const result = {
    ok: false,
    generatedAt: new Date().toISOString(),
    status: "blocked/ext",
    convexUrl: process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "unknown",
    failure: message,
    blockers: [message],
    nextActions: [
      "Point CONVEX_URL at the Convex deployment that has the current Looper backend functions deployed.",
      "Then re-run pnpm run qa:project-convex-readiness.",
    ],
  };
  writeEvidence(result);
  console.error(`Project Convex provider readiness failed: ${message}`);
  process.exit(1);
}

async function main() {
  const convexUrl = requiredEnv("CONVEX_URL");
  const signed = await convexEncoded(convexUrl, "action", "auth:signIn", {
    provider: "anonymous",
    params: {},
  });
  const token = signed?.tokens?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Anonymous auth did not return a Convex JWT.");
  }

  const viewer = await convexJson(convexUrl, "query", "upgrade:viewer", {}, token);
  const mockMode = await convexJson(convexUrl, "query", "mock:getMockMode", {}, token);
  const sttConfig = await convexJson(
    convexUrl,
    "query",
    "stt/transcribe:configuration",
    {},
    token,
  );

  const blockers = [];
  if (!viewer?.userId) blockers.push("anonymous auth did not resolve a viewer");
  if (mockMode?.forced) blockers.push("deployment MOCK_MODE is forced on");
  if (!sttConfig?.configured) blockers.push("STT provider is not configured");

  const result = {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? "ready-for-live-proof" : "blocked/ext",
    convexUrl,
    auth: {
      anonymousSignIn: true,
      viewerAuthenticated: Boolean(viewer?.userId),
      viewerIsAnonymous: viewer?.isAnonymous === true,
    },
    mockMode: {
      enabled: mockMode?.enabled === true,
      forced: mockMode?.forced === true,
    },
    stt: {
      configured: sttConfig?.configured === true,
      provider: sttConfig?.provider ?? null,
    },
    llm: {
      blockedByForcedMock: mockMode?.forced === true,
    },
    blockers,
    nextActions:
      blockers.length === 0
        ? [
            "Run MOCK_MODE=false CONVEX_URL=<project> STT_PROVIDER=<provider> CONVEX_AUTH_TOKEN=<token> pnpm run qa:external-stt-real.",
            "Run MOCK_MODE=false CONVEX_URL=<project> LLM_PROVIDER=<provider> CONVEX_AUTH_TOKEN=<token> pnpm run qa:external-llm-real.",
          ]
        : [
            "Disable global MOCK_MODE in the Convex deployment used by CONVEX_URL.",
            "Ensure the STT/LLM provider keys are set in that same Convex deployment.",
            "Re-run pnpm run qa:project-convex-readiness before the real provider gates.",
          ],
  };

  writeEvidence(result);
  console.log(
    `Project Convex provider readiness wrote ${textEvidencePath} (${result.status}).`,
  );
  if (!result.ok) {
    process.exitCode = 2;
  }
}

function loadEnvFile(path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return;

  const text = readFileSync(fullPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = parseEnvValue(rawValue);
    if (value.length > 0) process.env[key] = value;
  }
}

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  const withoutComment = trimmed.startsWith("\"") || trimmed.startsWith("'")
    ? trimmed
    : trimmed.replace(/\s+#.*$/, "");
  if (
    (withoutComment.startsWith("\"") && withoutComment.endsWith("\"")) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function convexEncoded(convexUrl, endpoint, path, args, token) {
  const body = { path, format: "convex_encoded_json", args: [args] };
  return await convexCall(convexUrl, endpoint, body, token);
}

async function convexJson(convexUrl, endpoint, path, args, token) {
  const body = { path, format: "json", args };
  return await convexCall(convexUrl, endpoint, body, token);
}

async function convexCall(convexUrl, endpoint, body, token) {
  const response = await fetch(`${convexUrl}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const bodyText = await response.text();
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`${endpoint} ${body.path} returned non-JSON ${response.status}.`);
  }
  if (!response.ok || json.status !== "success") {
    throw new Error(`${endpoint} ${body.path} failed ${response.status}: ${bodyText}`);
  }
  return json.value;
}

function writeEvidence(result) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(jsonEvidencePath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(textEvidencePath, `${formatEvidence(result)}\n`);
}

function formatEvidence(result) {
  return [
    "Gate: Project Convex provider readiness",
    `Date: ${result.generatedAt}`,
    `Status: ${result.status}`,
    `Result: ${result.status}`,
    "",
    `Convex URL: ${result.convexUrl ?? "unknown"}`,
    `Anonymous auth: ${result.auth?.anonymousSignIn === true ? "pass" : "fail"}`,
    `Viewer authenticated: ${result.auth?.viewerAuthenticated === true ? "yes" : "no"}`,
    `Viewer is anonymous: ${result.auth?.viewerIsAnonymous === true ? "yes" : "no"}`,
    `Mock enabled: ${result.mockMode?.enabled === true ? "yes" : "no"}`,
    `Mock forced: ${result.mockMode?.forced === true ? "yes" : "no"}`,
    `STT configured: ${result.stt?.configured === true ? "yes" : "no"}`,
    `STT provider: ${result.stt?.provider ?? "none"}`,
    `LLM blocked by forced mock: ${result.llm?.blockedByForcedMock === true ? "yes" : "no"}`,
    ...(result.failure ? [`Failure: ${result.failure}`] : []),
    `Blockers: ${result.blockers?.length ? result.blockers.join(", ") : "none"}`,
    "",
    "Next actions:",
    ...(result.nextActions ?? []).map((action) => `- ${action}`),
  ].join("\n");
}
