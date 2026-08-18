// Speech-to-text model configuration.
// Each provider has multiple models optimized for different use cases.

export type STTProvider = "deepgram" | "assemblyai" | "elevenlabs" | "openai";

export interface STTModelConfig {
  provider: STTProvider;
  model: string;
  name: string;
  description: string;
  realtime: boolean;
  languages: number;
}

export const STT_MODELS: STTModelConfig[] = [
  // Deepgram
  {
    provider: "deepgram",
    model: "nova-3",
    name: "Nova-3",
    description: "Best general-purpose. Multi-speaker, multilingual, noisy audio.",
    realtime: true,
    languages: 50,
  },
  {
    provider: "deepgram",
    model: "flux-general-en",
    name: "Flux (English)",
    description: "Optimized for voice agents and real-time customer support.",
    realtime: true,
    languages: 1,
  },
  {
    provider: "deepgram",
    model: "flux-general-multi",
    name: "Flux (Multilingual)",
    description: "Real-time multilingual conversations.",
    realtime: true,
    languages: 10,
  },
  // AssemblyAI
  {
    provider: "assemblyai",
    model: "universal-3-pro",
    name: "Universal-3 Pro",
    description: "Highest accuracy, native multilingual code-switching, keyterm prompting.",
    realtime: true,
    languages: 6,
  },
  // ElevenLabs
  {
    provider: "elevenlabs",
    model: "scribe_v2",
    name: "Scribe v2",
    description: "90+ languages, diarization up to 32 speakers, entity detection.",
    realtime: false,
    languages: 90,
  },
  {
    provider: "elevenlabs",
    model: "scribe_v2_realtime",
    name: "Scribe v2 Realtime",
    description: "Streaming STT ~150ms latency. VAD, conversational agents.",
    realtime: true,
    languages: 90,
  },
  // OpenAI
  {
    provider: "openai",
    model: "gpt-4o-transcribe",
    name: "GPT-4o Transcribe",
    description: "Highest accuracy. Strong on domain vocabulary and proper nouns.",
    realtime: false,
    languages: 90,
  },
  {
    provider: "openai",
    model: "gpt-4o-mini-transcribe",
    name: "GPT-4o mini Transcribe",
    description: "Faster and cheaper general-purpose transcription.",
    realtime: false,
    languages: 90,
  },
];

export const DEFAULT_STT_MODEL = "nova-3";

// Server-side defaults for prerecorded audio sent through the Convex batch
// transcription action. Realtime and OpenAI-compatible proxy adapters own
// separate model contracts.
export const BATCH_STT_DEFAULT_MODELS = {
  deepgram: "nova-3",
  assemblyai: "universal-3-pro",
  elevenlabs: "scribe_v2",
  openai: "gpt-4o-transcribe",
} as const satisfies Record<STTProvider, string>;

export function getSTTModel(model: string): STTModelConfig | undefined {
  return STT_MODELS.find((m) => m.model === model);
}
