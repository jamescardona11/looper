#!/usr/bin/env node
import {
  assertMockModeFalse,
  authTokenOrAnonymous,
  convex,
  convexUrl,
  optionalEnv,
  requiredEnv,
  viewer,
  writeEvidence,
} from "./convex-http.mjs";

const gate = "LLM real / cleanup";
const defaultRequiredTerms = "friday,site visit,installer,schedule";

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const provider = requiredEnv("LLM_PROVIDER");

  assertMockModeFalse();
  const token = await authTokenOrAnonymous();

  const user = await viewer(token);
  const startedAt = Date.now();
  const threadId = await convex(
    "mutation",
    "agent/threads:createThread",
    { title: "Release gate: LLM cleanup" },
    token,
  );
  if (typeof threadId !== "string" || threadId.length === 0) {
    throw new Error(`createThread returned an invalid thread id: ${JSON.stringify(threadId)}`);
  }

  let cleanupError;
  try {
    const prompt = optionalEnv(
      "LLM_CLEANUP_PROMPT",
      [
        "Clean up this dictated text without changing its meaning.",
        "Return one concise sentence only.",
        "",
        "raw: friday works better for the site visit the cabinets are delayed please confirm the installer schedule",
      ].join("\n"),
    );

    await convex("mutation", "agent/messages:addUserMessage", { threadId, content: prompt }, token);
    const assistant = await waitForAssistantReply(threadId, token);
    const text = assistant.content.trim();

    if (text.length === 0) {
      throw new Error("Assistant reply was empty.");
    }
    if (text.includes("Looper is streaming this simulated Recording Assistant response")) {
      throw new Error("Real LLM gate returned the mock model response while MOCK_MODE=false was required.");
    }
    const requiredTerms = optionalEnv("LLM_REQUIRED_TERMS", defaultRequiredTerms)
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    const missingTerms = requiredTerms.filter((term) => !text.toLowerCase().includes(term.toLowerCase()));
    if (missingTerms.length > 0) {
      throw new Error(
        `Cleanup reply did not preserve required terms (${missingTerms.join(", ")}): ${text}`,
      );
    }
    if (/raw:/i.test(text)) {
      throw new Error(`Cleanup reply still includes the raw transcript label: ${text}`);
    }

    const result = {
      ok: true,
      gate,
      generatedAt: new Date().toISOString(),
      convexUrl: convexUrl(),
      userId: user.userId,
      isAnonymous: user.isAnonymous === true,
      provider,
      threadId,
      prompt,
      text,
      requiredTerms,
      sourceMatched: true,
      status: assistant.status,
      durationMs: Date.now() - startedAt,
    };
    const paths = writeEvidence("llm-real-cleanup", result);
    console.log(JSON.stringify({ ...result, evidence: paths }, null, 2));
  } finally {
    try {
      await convex("mutation", "agent/threads:deleteThread", { threadId }, token);
    } catch (error) {
      cleanupError = error;
    }
    if (cleanupError) {
      console.warn(
        `Release gate warning: agent/threads:deleteThread failed: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`,
      );
    }
  }
}

async function waitForAssistantReply(threadId, token) {
  const timeoutMs = Number.parseInt(optionalEnv("LLM_TIMEOUT_MS", "45000"), 10);
  const pollMs = Number.parseInt(optionalEnv("LLM_POLL_MS", "750"), 10);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const messages = await convex("query", "agent/messages:list", { threadId }, token);
    if (!Array.isArray(messages)) {
      throw new Error(`agent/messages:list returned non-array: ${JSON.stringify(messages)}`);
    }

    const assistant = [...messages].reverse().find((message) => message?.role === "assistant");
    if (!assistant) continue;

    if (assistant.status === "done" && typeof assistant.content === "string") {
      return assistant;
    }
    if (assistant.status === "error") {
      throw new Error(assistant.content || "Assistant generation failed.");
    }
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for assistant cleanup reply.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
