#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  assertMockModeFalse,
  authTokenOrAnonymous,
  convex,
  convexUrl,
  optionalEnv,
  requiredEnv,
  root,
  viewer,
  writeEvidence,
} from "./convex-http.mjs";

const gate = "STT real con Harvard";
const defaultHarvardPattern = "stale|smell|beer|heat|odor|pickle|ham";

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const fixturePath = optionalEnv(
    "AUDIO_FIXTURE_PATH",
    join(root, "test-support/fixtures/audio/harvard.wav"),
  );
  const provider = requiredEnv("STT_PROVIDER");

  assertMockModeFalse();
  const token = await authTokenOrAnonymous();

  const user = await viewer(token);
  const uploadUrl = await convex("mutation", "stt/transcribe:generateUploadUrl", {}, token);
  const bytes = readFileSync(fixturePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": optionalEnv("AUDIO_CONTENT_TYPE", "audio/wav") },
    body: bytes,
  });
  const uploadBody = await uploadResponse.text();
  let uploadJson;
  try {
    uploadJson = JSON.parse(uploadBody);
  } catch {
    throw new Error(`Upload returned non-JSON ${uploadResponse.status}: ${uploadBody}`);
  }
  if (!uploadResponse.ok || typeof uploadJson.storageId !== "string") {
    throw new Error(`Upload failed ${uploadResponse.status}: ${uploadBody}`);
  }

  const startedAt = Date.now();
  const transcript = await convex(
    "action",
    "stt/transcribe:transcribe",
    {
      audioStorageId: uploadJson.storageId,
      provider,
      language: optionalEnv("STT_LANGUAGE", "en"),
      contentType: optionalEnv("AUDIO_CONTENT_TYPE", "audio/wav"),
      retainAudio: process.env.RETAIN_AUDIO === "true",
    },
    token,
  );

  if (typeof transcript?.text !== "string" || transcript.text.trim().length === 0) {
    throw new Error(`Transcribe returned no text: ${JSON.stringify(transcript)}`);
  }
  if (transcript.text.includes("[Simulated transcript]")) {
    throw new Error("Real STT gate returned the mock transcript while MOCK_MODE=false was required.");
  }
  const expectedPattern = optionalEnv("STT_EXPECTED_PATTERN", defaultHarvardPattern);
  const expected = new RegExp(expectedPattern, "i");
  if (!expected.test(transcript.text)) {
    throw new Error(
      `Real STT transcript did not match STT_EXPECTED_PATTERN=${expectedPattern}: ${transcript.text}`,
    );
  }

  const result = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    convexUrl: convexUrl(),
    userId: user.userId,
    isAnonymous: user.isAnonymous === true,
    provider,
    fixture: fixturePath,
    fixtureName: basename(fixturePath),
    fixtureBytes: statSync(fixturePath).size,
    storageId: uploadJson.storageId,
    transcriptionId: transcript.transcriptionId,
    text: transcript.text,
    expectedPattern,
    sourceMatched: true,
    durationMs: Date.now() - startedAt,
  };
  const paths = writeEvidence("stt-real-harvard", result);
  console.log(JSON.stringify({ ...result, evidence: paths }, null, 2));
}
