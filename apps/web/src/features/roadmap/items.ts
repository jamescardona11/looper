export type RoadmapStatus = "shipped" | "in-progress" | "planned";

export interface RoadmapItem {
  status: RoadmapStatus;
  title: string;
  description: string;
}

export const roadmap: RoadmapItem[] = [
  {
    status: "shipped",
    title: "Local-first desktop dictation",
    description:
      "Fast dictation, local STT, replacements, styles, Smart Modes, OCR context, and durable History on macOS, Windows, and Linux.",
  },
  {
    status: "shipped",
    title: "Recording assistant",
    description:
      "Private questions, summaries, rewrites, translations, and opt-in search over synced transcript text.",
  },
  {
    status: "shipped",
    title: "Meetings and audio imports",
    description:
      "Botless system-audio capture, recoverable WAV recordings, watch folders, public-audio import, notes, and Markdown export.",
  },
  {
    status: "shipped",
    title: "Mobile capture and remote dictation",
    description:
      "iOS and Android voice notes, keyboards, transcript search, phone-to-desktop dictation, and quick dictation on iOS.",
  },
  {
    status: "shipped",
    title: "Honest cloud audio activity",
    description:
      "Account-scoped transcription count, known duration, processed bytes, retained storage, and provider breakdown.",
  },
  {
    status: "in-progress",
    title: "Faster recording retrieval",
    description:
      "Deeper semantic search and better links from answers back to the exact transcript or meeting source.",
  },
  {
    status: "planned",
    title: "Global recording question",
    description:
      "A system-wide desktop entry point to ask the private recording assistant without turning Looper into a general chatbot.",
  },
];
