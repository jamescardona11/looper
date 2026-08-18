// Speech-to-text transcription via Deepgram, AssemblyAI, ElevenLabs, or OpenAI.
//
// Env vars (at least one):
//   DEEPGRAM_API_KEY   — for Deepgram transcription
//   ASSEMBLYAI_API_KEY — for AssemblyAI transcription
//   ELEVENLABS_API_KEY — for ElevenLabs transcription
//   OPENAI_API_KEY     — for OpenAI transcription (gpt-4o-transcribe)

import { getAuthUserId } from "@convex-dev/auth/server";
import { FEATURE_CREDIT_COST } from "@looper/config/agent";
import { BATCH_STT_DEFAULT_MODELS } from "@looper/config/stt";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { env, isMockMode } from "../env";
import { beginMeteredAction } from "../lib/meteredAction";
import { runTrackedGeneration } from "../lib/trackedGeneration";
import { isMockEnabledForUser } from "../mock";

// Server key for the chosen STT provider (only `openai` is BYOK-capable, so the
// others always resolve to the server key inside beginMeteredAction).
type BatchSttProvider = "deepgram" | "assemblyai" | "elevenlabs" | "openai";
const BATCH_STT_PROVIDERS = new Set<BatchSttProvider>([
  "deepgram",
  "assemblyai",
  "elevenlabs",
  "openai",
]);

function serverKeyFor(provider: BatchSttProvider) {
  return provider === "deepgram"
    ? env.DEEPGRAM_API_KEY
    : provider === "assemblyai"
      ? env.ASSEMBLYAI_API_KEY
      : provider === "elevenlabs"
        ? env.ELEVENLABS_API_KEY
        : env.OPENAI_API_KEY;
}

function defaultModelFor(provider: BatchSttProvider): string {
  return BATCH_STT_DEFAULT_MODELS[provider];
}

function configuredProvider(): BatchSttProvider | null {
  if (isMockMode()) return "deepgram";
  const override = sttProviderOverride();
  if (override) {
    return serverKeyFor(override) ? override : null;
  }
  if (env.DEEPGRAM_API_KEY) return "deepgram";
  if (env.OPENAI_API_KEY) return "openai";
  if (env.ASSEMBLYAI_API_KEY) return "assemblyai";
  if (env.ELEVENLABS_API_KEY) return "elevenlabs";
  return null;
}

function sttProviderOverride(): BatchSttProvider | null {
  const value = process.env.STT_PROVIDER;
  return BATCH_STT_PROVIDERS.has(value as BatchSttProvider) ? (value as BatchSttProvider) : null;
}

export const configuration = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const userMockEnabled = userId ? await isMockEnabledForUser(ctx, userId) : false;
    const provider = userMockEnabled ? "deepgram" : configuredProvider();
    return {
      configured: provider !== null,
      provider,
    };
  },
});

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";
const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    return await ctx.storage.generateUploadUrl();
  },
});

export const transcribe = action({
  args: {
    audioStorageId: v.id("_storage"),
    provider: v.union(
      v.literal("deepgram"),
      v.literal("assemblyai"),
      v.literal("elevenlabs"),
      v.literal("openai"),
    ),
    model: v.optional(v.string()),
    language: v.optional(v.string()),
    contentType: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    retainAudio: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      audioStorageId,
      provider,
      model: requestedModel,
      language,
      contentType,
      durationMs,
      retainAudio = false,
    },
  ) => {
    try {
      const model = requestedModel ?? defaultModelFor(provider);
      const { userId, mock, apiKey } = await beginMeteredAction(ctx, {
        cost: FEATURE_CREDIT_COST.transcription,
        provider,
        reason: "Transcription",
        serverApiKey: serverKeyFor(provider),
      });
      const audioMetadata = await ctx.runQuery((internal as any).stt.transcribe.getAudioMetadata, {
        audioStorageId,
      });

      return await runTrackedGeneration({
        create: async () =>
          await ctx.runMutation((internal as any).stt.transcribe.createPlaceholder, {
            userId,
            audioStorageId,
            provider,
            model,
            durationMs,
            audioSizeBytes: audioMetadata?.size,
            audioRetained: retainAudio,
          }),
        execute: async () => {
          const audioUrl = await ctx.storage.getUrl(audioStorageId);
          if (!audioUrl) throw new Error("Audio file not found in storage");

          const audioResponse = await fetch(audioUrl);
          if (!audioResponse.ok) {
            throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
          }
          const audioBuffer = await audioResponse.arrayBuffer();
          const resolvedContentType =
            contentType ?? audioResponse.headers.get("content-type") ?? undefined;

          if (mock) {
            return "[Simulated transcript] The stale smell of old beer lingers. It takes heat to bring out the odor. A salt pickle tastes fine with ham.";
          }
          if (provider === "deepgram") {
            return await transcribeWithDeepgram(
              apiKey,
              audioBuffer,
              model,
              language,
              resolvedContentType,
            );
          }
          if (provider === "elevenlabs") {
            return await transcribeWithElevenLabs(
              apiKey,
              audioBuffer,
              model,
              language,
              resolvedContentType,
            );
          }
          if (provider === "openai") {
            return await transcribeWithOpenAI(
              apiKey,
              audioBuffer,
              model,
              language,
              resolvedContentType,
            );
          }
          return await transcribeWithAssemblyAI(apiKey, audioBuffer, model, language);
        },
        complete: async (transcriptionId, text) => {
          await ctx.runMutation((internal as any).stt.transcribe.finalize, {
            transcriptionId,
            status: "done",
            text,
            language,
          });
          return { transcriptionId, text };
        },
        fail: async (transcriptionId, error) => {
          await ctx.runMutation((internal as any).stt.transcribe.finalize, {
            transcriptionId,
            status: "error",
            error,
          });
        },
      });
    } finally {
      if (!retainAudio) {
        await ctx.runMutation((internal as any).stt.transcribe.deleteAudio, {
          audioStorageId,
        });
      }
    }
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await (ctx.db as any)
      .query("sttTranscriptions")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const createPlaceholder = internalMutation({
  args: {
    userId: v.id("users"),
    audioStorageId: v.id("_storage"),
    provider: v.union(
      v.literal("deepgram"),
      v.literal("assemblyai"),
      v.literal("elevenlabs"),
      v.literal("openai"),
    ),
    model: v.string(),
    durationMs: v.optional(v.number()),
    audioSizeBytes: v.optional(v.number()),
    audioRetained: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await (ctx.db as any).insert("sttTranscriptions", {
      ...args,
      status: "transcribing",
      createdAt: Date.now(),
    });
  },
});

export const getAudioMetadata = internalQuery({
  args: { audioStorageId: v.id("_storage") },
  handler: async (ctx, { audioStorageId }) => {
    const metadata = await ctx.db.system.get("_storage", audioStorageId);
    return metadata ? { size: metadata.size } : null;
  },
});

export const finalize = internalMutation({
  args: {
    transcriptionId: v.id("sttTranscriptions"),
    status: v.union(v.literal("done"), v.literal("error")),
    text: v.optional(v.string()),
    language: v.optional(v.string()),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { transcriptionId, ...fields }) => {
    await (ctx.db as any).patch(transcriptionId, fields);
  },
});

export const deleteAudio = internalMutation({
  args: { audioStorageId: v.id("_storage") },
  handler: async (ctx, { audioStorageId }) => {
    await ctx.storage.delete(audioStorageId);
  },
});

async function transcribeWithDeepgram(
  apiKey: string | undefined,
  audioBuffer: ArrayBuffer,
  model: string,
  language?: string,
  contentType?: string,
): Promise<string> {
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

  const params = new URLSearchParams({ model });
  if (language) params.set("language", language);

  const response = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": contentType ?? "audio/mpeg",
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (!transcript && transcript !== "") {
    throw new Error("Deepgram returned no transcript");
  }
  return transcript;
}

async function transcribeWithAssemblyAI(
  apiKey: string | undefined,
  audioBuffer: ArrayBuffer,
  model: string,
  language?: string,
): Promise<string> {
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not set");

  const headers = {
    authorization: apiKey,
    "Content-Type": "application/json",
  };

  // Step 1: Upload audio to AssemblyAI
  const uploadResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/upload`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "Content-Type": "application/octet-stream",
    },
    body: audioBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`AssemblyAI upload error ${uploadResponse.status}: ${errorText}`);
  }

  const { upload_url } = await uploadResponse.json();

  // Step 2: Submit transcription job. `speech_models` is REQUIRED by the
  // AssemblyAI API — pre-recorded transcription has no default model, so
  // omitting it returns a 400. Universal-2 covers languages outside the
  // current Pro model.
  const transcriptBody: Record<string, unknown> = {
    audio_url: upload_url,
    speech_models: [model, "universal-2"],
  };
  if (language) transcriptBody.language_code = language;

  const submitResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
    method: "POST",
    headers,
    body: JSON.stringify(transcriptBody),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`AssemblyAI submit error ${submitResponse.status}: ${errorText}`);
  }

  const { id: transcriptId } = await submitResponse.json();

  // Step 3: Poll until complete
  const pollingUrl = `${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pollResponse = await fetch(pollingUrl, { headers });
    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      throw new Error(`AssemblyAI poll error ${pollResponse.status}: ${errorText}`);
    }

    const result = await pollResponse.json();

    if (result.status === "completed") {
      return result.text ?? "";
    }
    if (result.status === "error") {
      throw new Error(`AssemblyAI transcription failed: ${result.error}`);
    }
    // status is "queued" or "processing" — keep polling
  }

  throw new Error("AssemblyAI transcription timed out after 3 minutes");
}

async function transcribeWithElevenLabs(
  apiKey: string | undefined,
  audioBuffer: ArrayBuffer,
  model: string,
  language?: string,
  contentType?: string,
): Promise<string> {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const { type, ext } = audioFormat(contentType);
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type }), `audio.${ext}`);
  formData.append("model_id", model);
  if (language) formData.append("language_code", language);

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs STT error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.text ?? "";
}

// Multipart providers infer the audio format from the upload's file extension,
// so the name must match the actual bytes (browsers record webm, mobile
// clients record m4a).
function audioFormat(contentType?: string): { type: string; ext: string } {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("webm")) return { type: "audio/webm", ext: "webm" };
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac"))
    return { type: "audio/mp4", ext: "m4a" };
  if (ct.includes("wav")) return { type: "audio/wav", ext: "wav" };
  if (ct.includes("ogg")) return { type: "audio/ogg", ext: "ogg" };
  if (ct.includes("flac")) return { type: "audio/flac", ext: "flac" };
  return { type: "audio/mpeg", ext: "mp3" };
}

async function transcribeWithOpenAI(
  apiKey: string | undefined,
  audioBuffer: ArrayBuffer,
  model: string,
  language?: string,
  contentType?: string,
): Promise<string> {
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // The shared `model` arg defaults to a Deepgram model; map anything that
  // isn't an OpenAI transcription model to the best OpenAI default.
  const openaiModel =
    model.startsWith("gpt-4o-transcribe") ||
    model === "gpt-4o-mini-transcribe" ||
    model === "whisper-1"
      ? model
      : "gpt-4o-transcribe";

  const { type, ext } = audioFormat(contentType);

  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type }), `audio.${ext}`);
  formData.append("model", openaiModel);
  formData.append("response_format", "json");
  if (language) formData.append("language", language);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI STT error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.text ?? "";
}
