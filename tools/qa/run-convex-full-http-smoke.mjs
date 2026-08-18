#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const textEvidencePath = join(evidenceDir, "convex-full-http-smoke.txt");
const jsonEvidencePath = join(evidenceDir, "convex-full-http-smoke.json");
const startedAt = Date.now();

loadEnvFile("backend/.env");
if (!process.env.CONVEX_URL && process.env.VITE_CONVEX_URL) {
  process.env.CONVEX_URL = process.env.VITE_CONVEX_URL;
}

const requiredAll = process.env.CONVEX_FULL_REQUIRE_ALL === "1";
const providerSmoke = process.env.CONVEX_FULL_PROVIDER_SMOKE !== "0";
const checks = [];
const cleanup = [];
const state = {};

try {
  await main();
} catch (error) {
  record("convex full smoke runner", "fail", error);
} finally {
  await runCleanup();
  const result = buildResult();
  writeEvidence(result);
  console.log(`Convex full HTTP smoke wrote ${textEvidencePath} (${result.status}).`);
  if (result.coreFailed > 0) {
    process.exitCode = 1;
  } else if (requiredAll && result.blocked > 0) {
    process.exitCode = 2;
  }
}

async function main() {
  state.convexUrl = requiredEnv("CONVEX_URL");

  const signIn = await convexEncoded("action", "auth:signIn", {
    provider: "anonymous",
    params: {},
  });
  assertString(signIn?.tokens?.token, "anonymous signIn token");
  record("auth anonymous signIn", "pass", undefined, { tokenReturned: true });

  state.token = signIn.tokens.token;
  assertString(state.token, "auth token");

  await step("upgrade viewer", async () => {
    const viewer = await convexJson("query", "upgrade:viewer", {}, state.token);
    assertString(viewer?.userId, "viewer.userId");
    state.userId = viewer.userId;
    return { isAnonymous: viewer.isAnonymous === true };
  });

  await step("users me", async () => {
    const me = await convexJson("query", "users:me", {}, state.token);
    assertString(me?._id, "users.me._id");
    return { userId: me._id };
  });

  await step("mock mode read/toggle/read", async () => {
    const before = await convexJson("query", "mock:getMockMode", {}, state.token);
    await convexJson("mutation", "mock:setMockMode", { enabled: true }, state.token);
    cleanup.push(async () => {
      await convexJson("mutation", "mock:setMockMode", { enabled: false }, state.token);
    });
    const after = await convexJson("query", "mock:getMockMode", {}, state.token);
    if (!after?.enabled) throw new Error("mock mode did not enable for this user");
    return { forced: before?.forced === true, enabled: after.enabled === true };
  });

  await step("health status", async () => {
    const health = await convexJson("query", "health:status", {}, state.token);
    if (health?.status !== "ok") throw new Error(`unexpected health status ${health?.status}`);
    return { users: health?.stats?.users, threads: health?.stats?.threads };
  });

  await step("waitlist join/status/count", async () => {
    const email = `convex-smoke-${Date.now()}@example.test`;
    const joined = await convexJson("mutation", "waitlist/waitlist:join", { email }, state.token);
    assertString(joined?.referralCode, "waitlist referralCode");
    const status = await convexJson(
      "query",
      "waitlist/waitlist:statusByCode",
      { referralCode: joined.referralCode },
      state.token,
    );
    const count = await convexJson("query", "waitlist/waitlist:count", {}, state.token);
    if (!status) throw new Error("waitlist statusByCode returned null");
    return { referralCode: joined.referralCode, count };
  });

  await step("feedback submit/listForAdmin", async () => {
    await convexJson(
      "mutation",
      "feedback/feedback:submit",
      { kind: "bug", message: "Convex full smoke feedback", path: "/qa/convex-full" },
      state.token,
    );
    const adminList = await convexJson(
      "query",
      "feedback/feedback:listForAdmin",
      { limit: 5 },
      state.token,
    );
    if (!Array.isArray(adminList)) throw new Error("feedback listForAdmin returned non-array");
    return { visibleToCaller: adminList.length };
  });

  await runDictionaryChecks();
  await runRemoteDictationChecks();
  await runHistoryChecks();
  await runOnboardingChecks();
  await runAgentChecks();
  await runBillingAndAccountChecks();
  await runStorageBackedChecks();
  await runUserKeyChecks();
  await runAdminChecks();

  if (providerSmoke) {
    await runProviderChecks();
  } else {
    record("provider-backed Convex checks", "skipped", "CONVEX_FULL_PROVIDER_SMOKE=0");
  }
}

async function runDictionaryChecks() {
  await step("dictionary add/list/remove", async () => {
    const id = await convexJson(
      "mutation",
      "dictation/dictionary:add",
      { term: `J11-${Date.now()}` },
      state.token,
    );
    const list = await convexJson("query", "dictation/dictionary:list", {}, state.token);
    if (!list.some((entry) => entry._id === id)) throw new Error("dictionary entry not listed");
    await convexJson("mutation", "dictation/dictionary:remove", { id }, state.token);
    return { insertedId: id };
  });

  await step("replacements add/list/remove", async () => {
    const id = await convexJson(
      "mutation",
      "dictation/replacements:add",
      { source: "site visit", destination: "site-visit" },
      state.token,
    );
    const list = await convexJson("query", "dictation/replacements:list", {}, state.token);
    if (!list.some((entry) => entry._id === id)) throw new Error("replacement entry not listed");
    await convexJson("mutation", "dictation/replacements:remove", { id }, state.token);
    return { insertedId: id };
  });

  await step("snippets add/list/remove", async () => {
    const id = await convexJson(
      "mutation",
      "dictation/snippets:add",
      { trigger: ";addr", expansion: "123 Convex Way" },
      state.token,
    );
    const list = await convexJson("query", "dictation/snippets:list", {}, state.token);
    if (!list.some((entry) => entry._id === id)) throw new Error("snippet entry not listed");
    await convexJson("mutation", "dictation/snippets:remove", { id }, state.token);
    return { insertedId: id };
  });

  await step("settings get/update/get", async () => {
    await convexJson(
      "mutation",
      "dictation/settings:update",
      { data: { language: "en", source: "convex-full-smoke" } },
      state.token,
    );
    const doc = await convexJson("query", "dictation/settings:get", {}, state.token);
    if (doc?.data?.source !== "convex-full-smoke") throw new Error("settings update not readable");
    return { version: doc.version };
  });
}

async function runRemoteDictationChecks() {
  await step("remote dictation register/list/send/consume/end", async () => {
    const sessionId = `convex-smoke-${Date.now()}`;
    await convexJson(
      "mutation",
      "dictation/remote:registerSession",
      { sessionId, name: "Convex Smoke Desktop" },
      state.token,
    );
    const sessions = await convexJson("query", "dictation/remote:listActiveSessions", {}, state.token);
    if (!sessions.some((session) => session.sessionId === sessionId)) {
      throw new Error("remote session not listed");
    }
    const sent = await convexJson(
      "mutation",
      "dictation/remote:sendDictation",
      { sessionId, text: "remote dictation smoke" },
      state.token,
    );
    const pending = await convexJson(
      "query",
      "dictation/remote:getPendingDictation",
      { sessionId },
      state.token,
    );
    if (pending?.seq !== sent.seq) throw new Error("pending dictation seq mismatch");
    const consumed = await convexJson(
      "mutation",
      "dictation/remote:consumeDictation",
      { sessionId, seq: sent.seq },
      state.token,
    );
    if (consumed?.consumed !== true) throw new Error("pending dictation not consumed");
    await convexJson("mutation", "dictation/remote:endSession", { sessionId }, state.token);
    return { sessionId, seq: sent.seq };
  });
}

async function runHistoryChecks() {
  await step("transcriptions record/list/remove", async () => {
    const id = await convexJson(
      "mutation",
      "dictation/transcriptions:record",
      { text: "local transcript smoke", source: "local" },
      state.token,
    );
    const list = await convexJson(
      "query",
      "dictation/transcriptions:list",
      { limit: 10 },
      state.token,
    );
    if (!list.some((entry) => entry._id === id)) throw new Error("transcription not listed");
    await convexJson("mutation", "dictation/transcriptions:remove", { id }, state.token);
    return { insertedId: id };
  });
}

async function runOnboardingChecks() {
  await step("onboarding state/complete/skipAll", async () => {
    const before = await convexJson("query", "onboarding/onboarding:myState", {}, state.token);
    await convexJson(
      "mutation",
      "onboarding/onboarding:completeStep",
      { step: "profile", data: "{\"source\":\"convex-full-smoke\"}" },
      state.token,
    );
    await convexJson("mutation", "onboarding/onboarding:skipAll", {}, state.token);
    const after = await convexJson("query", "onboarding/onboarding:myState", {}, state.token);
    if (after?.isComplete !== true) throw new Error("onboarding skipAll did not complete");
    return { firstStep: before?.currentStep, isComplete: after.isComplete };
  });
}

async function runAgentChecks() {
  await step("recording assistant thread CRUD/archive/delete", async () => {
    const threadId = await convexJson(
      "mutation",
      "agent/threads:createThread",
      { title: "Convex full smoke" },
      state.token,
    );
    state.threadId = threadId;
    cleanup.push(async () => {
      await convexJson("mutation", "agent/threads:deleteThread", { threadId }, state.token);
    });
    const threads = await convexJson(
      "query",
      "agent/threads:listThreads",
      { archived: false, limit: 10 },
      state.token,
    );
    if (!threads.some((thread) => thread._id === threadId)) throw new Error("thread not listed");
    await convexJson(
      "mutation",
      "agent/threads:renameThread",
      { threadId, title: "Convex full smoke renamed" },
      state.token,
    );
    await convexJson("mutation", "agent/threads:archiveThread", { threadId }, state.token);
    await convexJson("mutation", "agent/threads:deleteThread", { threadId }, state.token);
    state.threadId = undefined;
    return { threadId };
  });

  await step("recording assistant message add/list/cancel/prune", async () => {
    const threadId = await convexJson(
      "mutation",
      "agent/threads:createThread",
      { title: "Convex message smoke" },
      state.token,
    );
    cleanup.push(async () => {
      await convexJson("mutation", "agent/threads:deleteThread", { threadId }, state.token);
    });
    const messageId = await convexJson(
      "mutation",
      "agent/messages:addUserMessage",
      { threadId, content: "Summarize the decisions in this recording." },
      state.token,
    );
    await convexJson("mutation", "agent/messages:cancelGeneration", { threadId }, state.token);
    const messages = await convexJson("query", "agent/messages:list", { threadId }, state.token);
    if (!messages.some((message) => message._id === messageId)) throw new Error("message not listed");
    await convexJson("mutation", "agent/threads:deleteThread", { threadId }, state.token);
    await convexJson("mutation", "agent/threads:pruneEmptyThreads", {}, state.token);
    return { messageId, messageCount: messages.length };
  });

  await step("agent usage/balance queries", async () => {
    const balance = await convexJson("query", "agent/credits:balance", {}, state.token);
    const monthly = await convexJson("query", "agent/usage:monthlyUsage", {}, state.token);
    const today = await convexJson("query", "agent/usage:todayUsage", {}, state.token);
    const daily = await convexJson("query", "agent/usage:dailyUsage", { days: 7 }, state.token);
    return {
      tier: balance?.tier,
      monthlyMessages: monthly?.messages,
      todayMessages: today?.messages,
      dailyDays: daily?.days,
    };
  });
}

async function runBillingAndAccountChecks() {
  await step("payments subscription/credits", async () => {
    const subscription = await convexJson(
      "query",
      "payments/subscription:mySubscription",
      {},
      state.token,
    );
    const credits = await convexJson("query", "payments/credits:myCredits", {}, state.token);
    return { tier: subscription?.tier, status: subscription?.status, credits };
  });

  await step("account data export", async () => {
    const exported = await convexJson("query", "accountData:exportMyData", {}, state.token);
    if (!exported?.exportedAt) throw new Error("account export missing exportedAt");
    return { exportKeys: Object.keys(exported).length };
  });
}

async function runStorageBackedChecks() {
  await step("upload generateUploadUrl", async () => {
    const url = await convexJson("mutation", "upload:generateUploadUrl", {}, state.token);
    assertString(url, "upload URL");
    return { hasUploadUrl: url.startsWith("http") };
  });

  await step("stt configuration/upload/list", async () => {
    const config = await convexJson("query", "stt/transcribe:configuration", {}, state.token);
    const uploadUrl = await convexJson(
      "mutation",
      "stt/transcribe:generateUploadUrl",
      {},
      state.token,
    );
    const storageId = await uploadFixture(uploadUrl);
    const list = await convexJson("query", "stt/transcribe:list", { limit: 5 }, state.token);
    if (!Array.isArray(list)) throw new Error("stt list returned non-array");
    return { configured: config?.configured, provider: config?.provider, storageId };
  });

  await step("cloud audio activity query", async () => {
    const usage = await convexJson("query", "stt/usage:current", {}, state.token);
    if (usage?.scope !== "cloud") throw new Error("stt usage must be cloud-scoped");
    return {
      today: usage.today?.transcriptions,
      month: usage.month?.transcriptions,
      providers: Object.keys(usage.byProvider ?? {}).length,
    };
  });
}

async function runUserKeyChecks() {
  await step("user keys status/clear", async () => {
    const status = await convexJson("query", "userKeys/keys:status", {}, state.token);
    if (!Array.isArray(status)) throw new Error("user key status returned non-array");
    await convexJson("mutation", "userKeys/keys:clearKey", { provider: "openai" }, state.token);
    return { providers: status.map((item) => item.provider).join(",") };
  });
}

async function runAdminChecks() {
  await step("admin and feedback safe read checks", async () => {
    const isAdmin = await convexJson("query", "admin:isAdmin", {}, state.token);
    if (isAdmin !== false) return { isAdmin };
    const denied = await expectConvexError(
      () => convexJson("query", "admin:listUsers", {}, state.token),
      "Access denied",
    );
    return { isAdmin, listUsersDenied: denied };
  });
}

async function runProviderChecks() {
  await step("stt transcribe openai", async () => {
    assertString(state.audioStorageId, "audio storage id");
    const result = await convexJson(
      "action",
      "stt/transcribe:transcribe",
      {
        audioStorageId: state.audioStorageId,
        provider: "openai",
        contentType: "audio/wav",
        durationMs: 18_000,
        retainAudio: false,
      },
      state.token,
    );
    assertString(result?.text, "stt transcript");
    return { transcriptLength: result.text.length };
  }, { provider: true });
}

async function step(name, fn, options = {}) {
  try {
    const details = await fn();
    record(name, "pass", undefined, details);
    return details;
  } catch (error) {
    record(name, options.provider ? "blocked/provider" : "fail", error);
    return undefined;
  }
}

function record(name, status, error, details) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  checks.push({
    name,
    status,
    ...(message ? { message: redact(message) } : {}),
    ...(details ? { details: redact(details) } : {}),
  });
}

async function runCleanup() {
  for (const clean of cleanup.reverse()) {
    try {
      await clean();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Not found")) {
        record("cleanup", "fail", error);
      }
    }
  }
}

async function convexEncoded(endpoint, path, args, token) {
  return await convexCall(endpoint, { path, format: "convex_encoded_json", args: [args] }, token);
}

async function convexJson(endpoint, path, args, token) {
  return await convexCall(endpoint, { path, format: "json", args }, token);
}

async function convexCall(endpoint, body, token) {
  const response = await fetch(`${state.convexUrl}/api/${endpoint}`, {
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
    throw new Error(`${endpoint} ${body.path} returned non-JSON ${response.status}: ${bodyText}`);
  }
  if (!response.ok || json.status !== "success") {
    throw new Error(`${endpoint} ${body.path} failed ${response.status}: ${bodyText}`);
  }
  return json.value;
}

async function expectConvexError(fn, expected) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return true;
    throw error;
  }
  throw new Error(`Expected Convex error containing "${expected}"`);
}

async function uploadFixture(uploadUrl) {
  const fixturePath = join(root, "test-support/fixtures/audio/harvard.wav");
  const bytes = readFileSync(fixturePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: bytes,
  });
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`fixture upload returned non-JSON ${response.status}: ${bodyText}`);
  }
  if (!response.ok || typeof body.storageId !== "string") {
    throw new Error(`fixture upload failed ${response.status}: ${bodyText}`);
  }
  state.audioStorageId = body.storageId;
  return body.storageId;
}

function buildResult() {
  const passed = checks.filter((check) => check.status === "pass").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  const blocked = checks.filter((check) => check.status === "blocked/provider").length;
  const skipped = checks.filter((check) => check.status === "skipped").length;
  const status = failed > 0 ? "failed" : blocked > 0 ? "partial/provider-blocked" : "pass";
  return {
    ok: failed === 0 && blocked === 0,
    generatedAt: new Date().toISOString(),
    status,
    convexUrl: state.convexUrl ?? "unknown",
    fixture: "test-support/fixtures/audio/harvard.wav",
    fixtureName: basename("harvard.wav"),
    providerSmoke,
    requiredAll,
    passed,
    blocked,
    skipped,
    failed,
    coreFailed: failed,
    durationMs: Date.now() - startedAt,
    checks,
    intentionallyExcluded: [
      "accountData:deleteMyAccount is destructive and is covered by unit tests instead of this smoke.",
      "payments checkout/portal actions can create real provider sessions and need sandbox evidence gates.",
      "admin mutations require a non-anonymous admin identity; this smoke verifies deny-by-default reads.",
    ],
  };
}

function writeEvidence(result) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(jsonEvidencePath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(textEvidencePath, `${formatEvidence(result)}\n`);
}

function formatEvidence(result) {
  return [
    "Gate: Convex full HTTP smoke",
    `Date: ${result.generatedAt}`,
    `Status: ${result.status}`,
    `Result: ${result.status}`,
    "",
    `Convex URL: ${result.convexUrl}`,
    `Fixture: ${result.fixture}`,
    `Provider smoke: ${result.providerSmoke ? "yes" : "no"}`,
    `Require all: ${result.requiredAll ? "yes" : "no"}`,
    `Passed: ${result.passed}`,
    `Provider blocked: ${result.blocked}`,
    `Skipped: ${result.skipped}`,
    `Failed: ${result.failed}`,
    `Duration ms: ${result.durationMs}`,
    "",
    "Checks:",
    ...result.checks.map((check) => {
      const suffix = check.message ? ` — ${check.message}` : "";
      return `- ${check.status}: ${check.name}${suffix}`;
    }),
    "",
    "Intentionally excluded:",
    ...result.intentionallyExcluded.map((item) => `- ${item}`),
  ].join("\n");
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
  const withoutComment =
    trimmed.startsWith("\"") || trimmed.startsWith("'") ? trimmed : trimmed.replace(/\s+#.*$/, "");
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

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function redact(value) {
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
      .replace(/"token"\s*:\s*"[^"]+"/g, "\"token\":\"[redacted]\"")
      .replace(/"secret"\s*:\s*"[^"]+"/g, "\"secret\":\"[redacted]\"");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  return value;
}
