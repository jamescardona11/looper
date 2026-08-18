import type { SttProvider } from "@looper/data";

export type TranscriptionProvider = SttProvider;
export type TranscriptionMode = "file" | "live";

export const TRANSCRIPTION_PROVIDER_LABELS: Record<TranscriptionProvider, string> = {
  deepgram: "Deepgram",
  assemblyai: "AssemblyAI",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
};

export function transcriptionProviderLabel(provider: string): string {
  return TRANSCRIPTION_PROVIDER_LABELS[provider as TranscriptionProvider] ?? provider;
}
