import type { MeetingContext, MeetingSession, Note } from "@looper/data";
import type { Locale } from "@looper/i18n";

export const PRODUCT_PREVIEW_MEETING_ID = "product-preview-launch-review";

const SPANISH_PREVIEW = {
  meetingId: PRODUCT_PREVIEW_MEETING_ID,
  meetingTitle: "Revisión de lanzamiento",
  notes: [
    {
      kind: "dictation" as const,
      title: "Idea para el onboarding",
      body: "Explicar la privacidad local antes de pedir acceso al micrófono.",
    },
    {
      kind: "note" as const,
      title: "Principios del lanzamiento",
      body: "Empezar con un grupo pequeño, escuchar cada semana y mantener una salida clara.",
    },
  ],
  transcript: [
    {
      speaker: "Ana",
      text: "Decidimos abrir la beta privada el viernes con el equipo de producto.",
      timestampMs: 8_000,
    },
    {
      speaker: "Diego",
      text: "Tarea: Ana prepara las notas de lanzamiento y Diego valida el onboarding.",
      timestampMs: 46_000,
    },
    {
      speaker: "Ana",
      text: "¿Qué métricas revisaremos durante la primera semana?",
      timestampMs: 79_000,
    },
  ],
  contexts: [
    {
      kind: "note" as const,
      title: "Notas del meeting",
      content:
        "Mantener el lanzamiento pequeño. Revisar activación, calidad de transcripción y preguntas recurrentes.",
    },
    {
      kind: "note" as const,
      title: "Momentos marcados",
      content: "46000\n79000",
    },
  ],
} as const;

const ENGLISH_PREVIEW = {
  meetingId: `${PRODUCT_PREVIEW_MEETING_ID}-en`,
  meetingTitle: "Launch review",
  notes: [
    {
      kind: "dictation" as const,
      title: "Onboarding idea",
      body: "Explain local privacy before requesting microphone access.",
    },
    {
      kind: "note" as const,
      title: "Launch principles",
      body: "Start with a small group, listen every week, and keep a clear way out.",
    },
  ],
  transcript: [
    {
      speaker: "Ana",
      text: "We decided to open the private beta on Friday with the product team.",
      timestampMs: 8_000,
    },
    {
      speaker: "Diego",
      text: "Task: Ana prepares the launch notes and Diego validates onboarding.",
      timestampMs: 46_000,
    },
    {
      speaker: "Ana",
      text: "Which metrics will we review during the first week?",
      timestampMs: 79_000,
    },
  ],
  contexts: [
    {
      kind: "note" as const,
      title: "Meeting notes",
      content:
        "Keep the launch small. Review activation, transcription quality, and recurring questions.",
    },
    {
      kind: "note" as const,
      title: "Marked moments",
      content: "46000\n79000",
    },
  ],
} as const;

export function productPreviewMeetingId(locale: Locale): string {
  return locale === "es" ? SPANISH_PREVIEW.meetingId : ENGLISH_PREVIEW.meetingId;
}

type NoteCommands = {
  create: (input: { title: string; body: string; kind?: "note" | "dictation" }) => Promise<string>;
};

type MeetingCommands = {
  start: (input: {
    meetingId: string;
    title: string;
    sharingEnabled: boolean;
  }) => Promise<{ meetingId: string; nextSequence: number }>;
  appendTranscript: (input: {
    meetingId: string;
    sequence: number;
    timestampMs: number;
    speaker?: string;
    text: string;
    status: "final";
  }) => Promise<{ nextSequence: number }>;
  addContext: (input: {
    meetingId: string;
    kind: "note";
    title: string;
    content: string;
  }) => Promise<string>;
  setState: (input: { meetingId: string; state: "ended"; sharingEnabled: false }) => Promise<void>;
};

export async function seedProductPreviewContent({
  contexts,
  meeting,
  meetingCommands,
  noteCommands,
  notes,
  locale = "es",
}: {
  contexts: MeetingContext[];
  meeting: MeetingSession | null;
  meetingCommands: MeetingCommands;
  noteCommands: NoteCommands;
  notes: Note[];
  locale?: Locale;
}): Promise<void> {
  const preview = locale === "es" ? SPANISH_PREVIEW : ENGLISH_PREVIEW;
  const existingTitles = new Set(notes.map((note) => note.title));
  for (const note of preview.notes) {
    if (!existingTitles.has(note.title)) await noteCommands.create(note);
  }

  let nextSequence = meeting?.nextSequence ?? 1;
  if (!meeting || nextSequence <= preview.transcript.length) {
    const active = await meetingCommands.start({
      meetingId: preview.meetingId,
      title: preview.meetingTitle,
      sharingEnabled: true,
    });
    nextSequence = active.nextSequence;
  }

  for (let index = nextSequence - 1; index < preview.transcript.length; index += 1) {
    const segment = preview.transcript[index];
    if (!segment) continue;
    const appended = await meetingCommands.appendTranscript({
      meetingId: preview.meetingId,
      sequence: nextSequence,
      speaker: segment.speaker,
      status: "final",
      text: segment.text,
      timestampMs: segment.timestampMs,
    });
    nextSequence = appended.nextSequence;
  }

  const existingContextTitles = new Set(contexts.map((context) => context.title));
  for (const context of preview.contexts) {
    if (!existingContextTitles.has(context.title)) {
      await meetingCommands.addContext({
        ...context,
        meetingId: preview.meetingId,
      });
    }
  }

  if (meeting?.state !== "ended" || meeting.nextSequence <= preview.transcript.length) {
    await meetingCommands.setState({
      meetingId: preview.meetingId,
      sharingEnabled: false,
      state: "ended",
    });
  }
}
