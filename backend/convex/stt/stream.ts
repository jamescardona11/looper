// Realtime (streaming) speech-to-text — control plane.
//
// The browser streams mic audio DIRECTLY to the provider's WebSocket; the audio
// never passes through Convex. Convex's only job is to mint a short-lived
// ephemeral token (gated by auth) so the provider key never reaches the client,
// and to persist the final transcript. Mirrors the realtime/ voice pattern.
//
// Env (one per provider you enable):
//   DEEPGRAM_API_KEY · ASSEMBLYAI_API_KEY · ELEVENLABS_API_KEY · OPENAI_API_KEY

import { getAuthUserId } from "@convex-dev/auth/server";
import { FEATURE_CREDIT_COST } from "@looper/config/agent";
import { v } from "convex/values";
import { action, mutation } from "../_generated/server";
import { env } from "../env";
import { beginMeteredAction } from "../lib/meteredAction";

// Server key for the chosen provider (only `openai` is BYOK-capable, so the
// others always resolve to the server key inside beginMeteredAction).
function serverKeyFor(provider: "deepgram" | "assemblyai" | "elevenlabs" | "openai") {
  return provider === "deepgram"
    ? env.DEEPGRAM_API_KEY
    : provider === "assemblyai"
      ? env.ASSEMBLYAI_API_KEY
      : provider === "elevenlabs"
        ? env.ELEVENLABS_API_KEY
        : env.OPENAI_API_KEY;
}

const providerArg = v.union(
  v.literal("deepgram"),
  v.literal("assemblyai"),
  v.literal("elevenlabs"),
  v.literal("openai"),
);

// Mint a single-use / short-lived token the browser uses to open the provider's
// streaming WebSocket. The client knows the per-provider WS URL + protocol; it
// only needs the credential from here. In MOCK_MODE returns `{ mock: true }` so
// the demo streams a simulated transcript with zero keys.
export const createStreamSession = action({
  args: { provider: providerArg },
  handler: async (ctx, { provider }) => {
    const { mock, apiKey } = await beginMeteredAction(ctx, {
      cost: FEATURE_CREDIT_COST.transcription,
      provider,
      reason: "Live transcription session",
      serverApiKey: serverKeyFor(provider),
    });
    if (mock) return { provider, mock: true as const, token: "" };

    const token =
      provider === "deepgram"
        ? await mintDeepgram(apiKey)
        : provider === "assemblyai"
          ? await mintAssemblyAI(apiKey)
          : provider === "elevenlabs"
            ? await mintElevenLabs(apiKey)
            : await mintOpenAI(apiKey);

    return { provider, mock: false as const, token };
  },
});

async function mintDeepgram(apiKey: string | undefined): Promise<string> {
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");
  // Browser-direct needs a grant token (the browser can't set the Authorization
  // header that a raw key requires). /v1/auth/grant 403s "Insufficient
  // permissions" unless DEEPGRAM_API_KEY has the grant scope (a Member/Owner key,
  // not a restricted project key). Fix the key's role in the Deepgram dashboard,
  // or proxy the WS server-side with the raw key (Authorization: Token <key>).
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  if (!res.ok) throw new Error(`Deepgram token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function mintAssemblyAI(apiKey: string | undefined): Promise<string> {
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not set");
  const params = new URLSearchParams({
    expires_in_seconds: "60",
    max_session_duration_seconds: "900",
  });
  const res = await fetch(`https://streaming.assemblyai.com/v3/token?${params}`, {
    // AssemblyAI expects the API key itself, without a Bearer prefix.
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`AssemblyAI token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.token as string;
}

async function mintElevenLabs(apiKey: string | undefined): Promise<string> {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.token as string;
}

async function mintOpenAI(apiKey: string | undefined): Promise<string> {
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  // Transcription-only Realtime session via /v1/realtime/client_secrets (the GA
  // endpoint the voice session already uses — /v1/realtime/sessions 404s on this
  // API version). Returns a short-lived ephemeral key.
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "transcription",
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe" },
            // Short silence window so continuous dictation still commits turns
            // (long pauses are rare in real speech; 500ms can starve transcripts).
            turn_detection: { type: "server_vad", silence_duration_ms: 200 },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI session error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const token = data.value ?? data.client_secret?.value;
  if (!token) throw new Error("OpenAI session returned no client secret");
  return token as string;
}

// Persist the final transcript from a live session into the shared history table
// (mode: "live", no audioStorageId — the audio was never stored).
export const saveStreamTranscript = mutation({
  args: {
    provider: providerArg,
    text: v.string(),
    language: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { provider, text, language, durationMs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    await (ctx.db as any).insert("sttTranscriptions", {
      userId,
      provider,
      model: "streaming",
      text,
      status: "done",
      language,
      durationMs,
      mode: "live",
      createdAt: Date.now(),
    });
    return { saved: true };
  },
});
