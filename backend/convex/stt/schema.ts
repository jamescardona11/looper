import { defineTable } from "convex/server";
import { v } from "convex/values";

export const sttTables = {
  sttTranscriptions: defineTable({
    userId: v.id("users"),
    // Optional: file/batch transcriptions store the uploaded audio; live
    // (streaming) transcriptions have no stored file — the audio streamed
    // straight to the provider and was never persisted.
    audioStorageId: v.optional(v.id("_storage")),
    // "file" = uploaded/recorded then transcribed in one shot; "live" = realtime
    // streaming. Defaults to file for existing rows (undefined).
    mode: v.optional(v.union(v.literal("file"), v.literal("live"))),
    provider: v.union(
      v.literal("deepgram"),
      v.literal("assemblyai"),
      v.literal("elevenlabs"),
      v.literal("openai"),
    ),
    model: v.string(),
    text: v.optional(v.string()),
    status: v.union(v.literal("transcribing"), v.literal("done"), v.literal("error")),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    // Recorded from Convex storage metadata before provider processing. Kept
    // even when the temporary upload is deleted, so usage stays truthful.
    audioSizeBytes: v.optional(v.number()),
    audioRetained: v.optional(v.boolean()),
    language: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),
};
