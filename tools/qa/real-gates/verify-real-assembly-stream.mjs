#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import WebSocket from "ws";
import {
  assertMockModeFalse,
  authTokenOrAnonymous,
  convex,
  convexUrl,
  optionalEnv,
  root,
  viewer,
  writeEvidence,
} from "./convex-http.mjs";

const gate = "AssemblyAI streaming real via Convex";
const defaultPattern = "stale|smell|beer|heat|odor|pickle|ham";

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  assertMockModeFalse();
  const fixturePath = optionalEnv(
    "AUDIO_FIXTURE_PATH",
    join(root, "test-support/fixtures/audio/harvard.wav"),
  );
  const audio = decodePcm16Wav(readFileSync(fixturePath));
  const token = await authTokenOrAnonymous();
  const user = await viewer(token);
  const grant = await convex(
    "action",
    "stt/stream:createStreamSession",
    { provider: "assemblyai" },
    token,
  );
  if (grant?.mock === true) throw new Error("Convex returned a mock AssemblyAI session.");
  if (typeof grant?.token !== "string" || grant.token.length === 0) {
    throw new Error(`Convex returned no AssemblyAI token: ${JSON.stringify(grant)}`);
  }

  const startedAt = Date.now();
  const text = await transcribe(grant.token, audio);
  const expectedPattern = optionalEnv("STT_EXPECTED_PATTERN", defaultPattern);
  if (!new RegExp(expectedPattern, "i").test(text)) {
    throw new Error(`Transcript did not match STT_EXPECTED_PATTERN=${expectedPattern}: ${text}`);
  }
  await convex(
    "mutation",
    "stt/stream:saveStreamTranscript",
    {
      provider: "assemblyai",
      text,
      language: optionalEnv("STT_LANGUAGE", "en"),
    },
    token,
  );

  const result = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    convexUrl: convexUrl(),
    userId: user.userId,
    isAnonymous: user.isAnonymous === true,
    provider: "assemblyai",
    model: "universal-streaming-multilingual",
    fixture: fixturePath,
    fixtureName: basename(fixturePath),
    fixtureBytes: statSync(fixturePath).size,
    sampleRate: audio.sampleRate,
    text,
    expectedPattern,
    durationMs: Date.now() - startedAt,
  };
  const paths = writeEvidence("assemblyai-stream-real", result);
  console.log(JSON.stringify({ ...result, evidence: paths }, null, 2));
}

function transcribe(token, audio) {
  return new Promise((resolve, reject) => {
    const url = new URL("wss://streaming.assemblyai.com/v3/ws");
    url.searchParams.set("sample_rate", String(audio.sampleRate));
    url.searchParams.set("speech_model", "universal-streaming-multilingual");
    url.searchParams.set("format_turns", "true");
    url.searchParams.set("token", token);
    const socket = new WebSocket(url);
    const turns = new Map();
    let currentTurn = "";
    let finished = false;

    const fail = (error) => {
      if (finished) return;
      finished = true;
      socket.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timeout = setTimeout(() => fail(new Error("AssemblyAI streaming timed out")), 90_000);

    socket.on("error", fail);
    socket.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        fail(new Error(`Invalid AssemblyAI message: ${error}`));
        return;
      }
      if (message.type === "Error") {
        fail(new Error(message.error ?? message.message ?? "AssemblyAI error"));
        return;
      }
      if (message.type === "Begin") {
        try {
          await sendRealtimeAudio(socket, audio.bytes, audio.sampleRate);
          socket.send(JSON.stringify({ type: "Terminate" }));
        } catch (error) {
          fail(error);
        }
        return;
      }
      if (message.type === "Turn") {
        const transcript = String(message.transcript ?? "").trim();
        const order = Number(message.turn_order ?? turns.size);
        if (message.end_of_turn === true) {
          if (transcript) turns.set(order, transcript);
          currentTurn = "";
        } else {
          currentTurn = transcript;
        }
        return;
      }
      if (message.type === "Termination" && !finished) {
        finished = true;
        clearTimeout(timeout);
        socket.close();
        const text = [
          ...[...turns.entries()].sort(([a], [b]) => a - b).map(([, value]) => value),
          currentTurn,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!text) reject(new Error("AssemblyAI returned an empty transcript"));
        else resolve(text);
      }
    });
  });
}

async function sendRealtimeAudio(socket, bytes, sampleRate) {
  const chunkBytes = Math.max(2, Math.floor(sampleRate / 10) * 2);
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    socket.send(bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length)));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function decodePcm16Wav(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("AUDIO_FIXTURE_PATH must be a RIFF/WAVE file.");
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4),
        bitsPerSample: bytes.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data) throw new Error("WAV is missing fmt or data chunks.");
  if (format.audioFormat !== 1 || format.channels < 1 || format.bitsPerSample !== 16) {
    throw new Error("AssemblyAI gate requires PCM16 WAV audio.");
  }
  return {
    bytes: format.channels === 1 ? data : downmixPcm16(data, format.channels),
    sampleRate: format.sampleRate,
  };
}

function downmixPcm16(bytes, channels) {
  const frameBytes = channels * 2;
  const output = Buffer.allocUnsafe(Math.floor(bytes.length / frameBytes) * 2);
  for (let inputOffset = 0, outputOffset = 0; inputOffset + frameBytes <= bytes.length; ) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += bytes.readInt16LE(inputOffset);
      inputOffset += 2;
    }
    output.writeInt16LE(Math.round(sum / channels), outputOffset);
    outputOffset += 2;
  }
  return output;
}
