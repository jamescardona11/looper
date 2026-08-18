export type ChangeType = "added" | "changed" | "fixed";

export interface ChangelogEntry {
  version: string;
  date: string;
  summary?: string;
  changes: Array<{ type: ChangeType; items: string[] }>;
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-07-18",
    summary: "Looper becomes a coherent audio-first workspace across desktop, web, and mobile.",
    changes: [
      {
        type: "added",
        items: [
          "Private recording assistant grounded in opt-in, text-only transcript memory",
          "Cloud audio activity with real transcription, duration, processing, and storage totals",
          "Voice-note questions on mobile and live or file transcription on web",
        ],
      },
      {
        type: "changed",
        items: [
          "Navigation, onboarding, pricing, and settings now describe one audio-first product",
          "Agent threads are private, text-only recording questions with one server-selected model",
          "Usage excludes local desktop processing and reports only account-linked cloud audio",
        ],
      },
      {
        type: "fixed",
        items: [
          "Deleting a recording question now removes its private messages",
          "Temporary audio keeps truthful size metadata after the uploaded file is deleted",
          "Recording Assistant no longer exposes generic code Canvas or horizontal slash commands",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-07-14",
    summary: "Desktop recording workflows become durable, local-first, and meeting-aware.",
    changes: [
      {
        type: "added",
        items: [
          "Watch-folder and public-audio imports with optional local denoise",
          "Botless meeting capture, interruption recovery, notes, summaries, and Markdown export",
          "Live captions, accessible readback, local OCR context, and format-aware dictation",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-07-10",
    summary: "Dictation settings and transcript memory sync across Looper surfaces.",
    changes: [
      {
        type: "added",
        items: [
          "Dictionary, replacements, snippets, styles, and Smart Modes",
          "Optional text-only transcript memory with provenance and local read-only MCP tools",
          "Mobile keyboards, remote phone-to-desktop dictation, and quick dictation App Intent",
        ],
      },
    ],
  },
];

export function formatChangelogDate(iso: string): string {
  if (!iso) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}
