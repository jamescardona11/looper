import {
  useAuth,
  useDictationDictionary,
  useDictationHistory,
  useDictationReplacements,
  useDictationSettings,
  useDictationSnippets,
  useMeetingCommands,
  useMeetingSessions,
  useNoteCommands,
  useNotes,
  useRecordDictation,
} from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { useEffect, useRef } from "react";

const PREVIEW_MEETING_ID = "product-preview-launch-review";
const PREVIEW_STYLE_ID = "product-preview-clear-brief";
const PREVIEW_MODE_RULE_ID = "product-preview-linear";

const PREVIEW_COPY = {
  en: {
    context: {
      content: "Launch on Friday after calendar permissions and onboarding are verified.",
      title: "Private beta brief",
    },
    dictations: [
      "The original stays next to the useful output, so nothing gets lost.",
      "Send the launch brief after the onboarding fixes are verified on mobile and web.",
      "Turn the meeting into decisions, owners and the questions we still need to answer.",
    ],
    meetingTitle: "Launch review",
    notes: [
      {
        title: "Launch principles",
        body: "## Keep the source close\n\nEvery polished output should preserve a clear path back to the original recording.\n\n## Launch checklist\n\n- Finish calendar permissions\n- Review the first-run experience\n- Invite the private beta group",
      },
      {
        title: "Product sync",
        body: "## What changed\n\nThe mobile capture flow and web workspace now share the same vocabulary, notes and meeting context.\n\n## Next\n\nValidate the launch story across every surface.",
      },
    ],
    styleName: "Clear brief",
    transcript: [
      {
        speaker: "Maya",
        text: "Decision: open the private beta on Friday with the onboarding fixes included.",
      },
      {
        speaker: "Ana",
        text: "Action item: Ana will prepare launch notes and Diego will validate calendar permissions.",
      },
      {
        speaker: "Diego",
        text: "Question: which activation metric will we review during the first week?",
      },
    ],
  },
  es: {
    context: {
      content:
        "Lanzar el viernes después de verificar los permisos del calendario y el onboarding.",
      title: "Resumen de la beta privada",
    },
    dictations: [
      "El original queda junto al resultado útil, para que no se pierda nada.",
      "Envía el resumen de lanzamiento cuando verifiquemos el onboarding en móvil y web.",
      "Convierte la reunión en decisiones, responsables y preguntas por resolver.",
    ],
    meetingTitle: "Revisión de lanzamiento",
    notes: [
      {
        title: "Principios del lanzamiento",
        body: "## Mantener la fuente cerca\n\nCada resultado pulido debe conservar una ruta clara a la grabación original.\n\n## Lista de lanzamiento\n\n- Terminar permisos del calendario\n- Revisar la primera experiencia\n- Invitar al grupo de beta privada",
      },
      {
        title: "Sincronización del producto",
        body: "## Qué cambió\n\nLa captura móvil y el espacio web ahora comparten vocabulario, notas y contexto de reuniones.\n\n## Siguiente paso\n\nValidar la historia de lanzamiento en cada superficie.",
      },
    ],
    styleName: "Claro y breve",
    transcript: [
      {
        speaker: "Maya",
        text: "Decisión: abrir la beta privada el viernes con las mejoras del onboarding incluidas.",
      },
      {
        speaker: "Ana",
        text: "Tarea: Ana preparará las notas de lanzamiento y Diego validará los permisos del calendario.",
      },
      {
        speaker: "Diego",
        text: "Pregunta: ¿qué métrica de activación revisaremos durante la primera semana?",
      },
    ],
  },
} as const;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function ProductPreviewSeeder() {
  const { locale } = useTranslation();
  const preview = PREVIEW_COPY[locale];
  const auth = useAuth();
  const notes = useNotes();
  const noteCommands = useNoteCommands();
  const dictations = useDictationHistory();
  const dictationCommands = useRecordDictation();
  const meetings = useMeetingSessions();
  const meetingCommands = useMeetingCommands();
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const snippets = useDictationSnippets();
  const settings = useDictationSettings();
  const hasStarted = useRef(false);

  useEffect(() => {
    const isLoading =
      auth.isLoading ||
      notes.isLoading ||
      dictations.isLoading ||
      meetings.isLoading ||
      dictionary.isLoading ||
      replacements.isLoading ||
      snippets.isLoading ||
      settings.isLoading;

    if (!auth.isAuthenticated) {
      document.documentElement.dataset.productPreviewStatus = "waiting-for-auth";
      return;
    }
    if (isLoading) {
      document.documentElement.dataset.productPreviewStatus = "waiting-for-data";
      return;
    }
    if (hasStarted.current) return;
    hasStarted.current = true;
    document.documentElement.dataset.productPreviewStatus = "seeding";

    const seed = async () => {
      const noteSeeds = preview.notes;
      await Promise.all(
        noteSeeds
          .filter((seedNote) => !notes.notes.some((note) => note.title === seedNote.title))
          .map((seedNote) => noteCommands.create(seedNote)),
      );

      const dictationSeeds = preview.dictations;
      await Promise.all(
        dictationSeeds
          .filter((text) => !dictations.items.some((item) => item.text === text))
          .map((text, index) =>
            dictationCommands.record({
              text,
              source: "local",
              sourceId: `product-preview-${index + 1}`,
              occurredAt: Date.now() - index * 1_800_000,
            }),
          ),
      );

      const previewMeeting = meetings.sessions.find(
        (meeting) => meeting.meetingId === PREVIEW_MEETING_ID,
      );
      if (!previewMeeting || previewMeeting.nextSequence <= 3) {
        const started = await meetingCommands.start({
          meetingId: PREVIEW_MEETING_ID,
          title: preview.meetingTitle,
          sharingEnabled: true,
        });
        let sequence = started.nextSequence;
        const transcript = preview.transcript;

        for (const [index, segment] of transcript.entries()) {
          if (index + 1 < sequence) continue;
          const appended = await meetingCommands.appendTranscript({
            meetingId: PREVIEW_MEETING_ID,
            sequence,
            timestampMs: index * 24_000,
            speaker: segment.speaker,
            text: segment.text,
            status: "final",
          });
          sequence = appended.nextSequence;
        }

        await meetingCommands.addContext({
          meetingId: PREVIEW_MEETING_ID,
          kind: "note",
          title: preview.context.title,
          content: preview.context.content,
        });
        await meetingCommands.setState({
          meetingId: PREVIEW_MEETING_ID,
          state: "ended",
          sharingEnabled: false,
        });
      }

      const terms = ["Looper", "Parakeet TDT", "Acme"];
      await Promise.all(
        terms
          .filter(
            (term) =>
              !dictionary.entries.some(
                (entry) => entry.term.toLocaleLowerCase() === term.toLocaleLowerCase(),
              ),
          )
          .map((term) => dictionary.add(term)),
      );

      if (!replacements.rules.some((rule) => rule.source === "ETA")) {
        await replacements.add("ETA", "estimated delivery");
      }
      if (!snippets.snippets.some((snippet) => snippet.trigger === "launchupdate")) {
        await snippets.add(
          "launchupdate",
          "The launch remains on track. The next checkpoint is Friday at 10:00 AM.",
        );
      }

      const settingsData = readRecord(settings.doc?.data);
      const styles = readRecord(settingsData.styles);
      const customTones = Array.isArray(styles.customTones) ? styles.customTones : [];
      const modeRules = Array.isArray(settingsData.mode_rules) ? settingsData.mode_rules : [];
      const hasPreviewStyle = customTones.some((tone) => readRecord(tone).id === PREVIEW_STYLE_ID);
      const hasPreviewRule = modeRules.some((rule) => readRecord(rule).id === PREVIEW_MODE_RULE_ID);

      if (!hasPreviewStyle || !hasPreviewRule) {
        await settings.update({
          ...settingsData,
          styles: {
            ...styles,
            customTones: hasPreviewStyle
              ? customTones
              : [
                  ...customTones,
                  {
                    id: PREVIEW_STYLE_ID,
                    name: preview.styleName,
                    promptTemplate: "Keep the answer concise, direct and ready to share.",
                  },
                ],
            selectedToneId:
              typeof styles.selectedToneId === "string" ? styles.selectedToneId : PREVIEW_STYLE_ID,
          },
          mode_rules: hasPreviewRule
            ? modeRules
            : [
                ...modeRules,
                {
                  id: PREVIEW_MODE_RULE_ID,
                  enabled: true,
                  trigger: { type: "url_pattern", url_pattern: "linear.app" },
                  transform_preset: "polish",
                  auto_send_on_insert: false,
                },
              ],
        });
      }

      document.documentElement.dataset.productPreviewStatus = "ready";
    };

    void seed().catch((error: unknown) => {
      document.documentElement.dataset.productPreviewStatus = "error";
      console.error("Failed to prepare the product preview account", error);
    });
  }, [
    auth.isAuthenticated,
    auth.isLoading,
    dictationCommands,
    dictations.isLoading,
    dictations.items,
    dictionary,
    meetingCommands,
    meetings.isLoading,
    meetings.sessions,
    noteCommands,
    notes.isLoading,
    notes.notes,
    preview,
    replacements,
    settings,
    snippets,
  ]);

  return null;
}
