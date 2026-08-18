import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const root = process.cwd();
export const evidenceDir = join(root, ".tcompound/evidence/release");

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

export function optionalEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function convexUrl() {
  return optionalEnv("CONVEX_URL", "http://127.0.0.1:3210");
}

export function authToken() {
  return process.env.CONVEX_AUTH_TOKEN?.trim() || process.env.E2E_CONVEX_AUTH_TOKEN?.trim();
}

export async function authTokenOrAnonymous() {
  const token = authToken();
  if (token) return token;
  if (process.env.ALLOW_ANONYMOUS_CONVEX_AUTH_TOKEN !== "true") {
    throw new Error("Missing CONVEX_AUTH_TOKEN or E2E_CONVEX_AUTH_TOKEN.");
  }

  const signed = await convex("action", "auth:signIn", {
    provider: "anonymous",
    params: {},
  });
  const anonymousToken = signed?.tokens?.token;
  if (typeof anonymousToken !== "string" || anonymousToken.length === 0) {
    throw new Error(`auth:signIn anonymous did not return a token: ${JSON.stringify(signed)}`);
  }
  return anonymousToken;
}

export async function convex(endpoint, path, args, token = authToken()) {
  const response = await fetch(`${convexUrl()}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, format: "json", args }),
  });
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`${endpoint} ${path} returned non-JSON ${response.status}: ${bodyText}`);
  }
  if (!response.ok || body.status !== "success") {
    throw new Error(`${endpoint} ${path} failed ${response.status}: ${bodyText}`);
  }
  return body.value;
}

export async function viewer(token = authToken()) {
  if (!token) {
    throw new Error("Missing CONVEX_AUTH_TOKEN or E2E_CONVEX_AUTH_TOKEN.");
  }
  const result = await convex("query", "upgrade:viewer", {}, token);
  if (!result?.userId) {
    throw new Error("Auth token did not resolve to an authenticated user.");
  }
  if (
    result.isAnonymous &&
    process.env.ALLOW_ANONYMOUS_CONVEX_AUTH_TOKEN !== "true"
  ) {
    throw new Error(
      "Auth token must belong to an identified non-anonymous user. Set ALLOW_ANONYMOUS_CONVEX_AUTH_TOKEN=true only for local provider smoke gates.",
    );
  }
  return result;
}

export function assertMockModeFalse() {
  if (process.env.MOCK_MODE !== "false") {
    throw new Error("Set MOCK_MODE=false for this real-provider release gate.");
  }
}

export function writeEvidence(name, result) {
  mkdirSync(evidenceDir, { recursive: true });
  const jsonPath = join(evidenceDir, `${name}.json`);
  const textPath = join(evidenceDir, `${name}.txt`);
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(textPath, `${formatEvidence(result)}\n`);
  return { jsonPath, textPath };
}

function formatEvidence(result) {
  const status = result.status ?? (result.ok ? "pass" : "failed");
  const lines = [
    `Gate: ${result.gate}`,
    `Date: ${result.generatedAt}`,
    `Status: ${status}`,
    "",
  ];
  for (const [key, value] of Object.entries(result)) {
    if (["gate", "generatedAt", "ok"].includes(key)) continue;
    lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  return lines.join("\n");
}
