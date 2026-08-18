import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";

type FAQCopy = Readonly<{
  topic: string;
  question: string;
  answer: string;
}>;

const join = (parts: readonly string[]) => parts.join(" ");

const FAQ_COPY = [
  {
    topic: "how_it_works",
    question: join(["How does", "Looper work?"]),
    answer: join([
      "Press your dictation shortcut, speak, and release.",
      "Local mode transcribes on your device and works offline.",
      "Cloud mode sends the recording to Looper Cloud.",
      "Both insert the result where your cursor is.",
    ]),
  },
  {
    topic: "privacy",
    question: join(["Where does", "my data go?"]),
    answer: join([
      "In Local mode, audio and transcripts stay on your computer.",
      "In Cloud mode, audio is uploaded for transcription and deleted after the request; the transcript is stored locally.",
      "History sync is separate, off by default, and uploads transcript text only—never audio.",
      "Optional anonymous usage analytics never include your audio or transcript and can be disabled in Settings → App.",
    ]),
  },
  {
    topic: "ai_writing",
    question: join(["When does text", "leave my device?"]),
    answer: join([
      "Only when you enable AI writing and run an AI operation.",
      "Cleanup, Edit Mode, Personalization, translations, and meeting summaries send the relevant text directly to the provider configured under Settings → Providers.",
      "Screen Context may include locally recognized text, but never a screenshot.",
      "Your API key stays stored locally in Looper.",
    ]),
  },
  {
    topic: "free",
    question: join(["What is free", "vs Looper Personal?"]),
    answer: join([
      "Core dictation is free: local transcription, dictionary, replacements, and history.",
      "There are no per-minute fees or subscriptions for that.",
      "Library, AI Cleanup, Edit Mode, personalization with an LLM, and the CLI are part of Looper Personal.",
      "You get a 14-day trial first; after that, activate a Personal license (a one-time purchase) or a Commercial license (billed yearly) in Settings → Account.",
    ]),
  },
  {
    topic: "delete",
    question: join(["How do I manage", "or delete my data?"]),
    answer: join([
      "Delete recordings from History, remove imported files or meetings from Library, or uninstall models from Settings → Models.",
      "Settings → App can auto-delete Audio only or full Transcripts (including linked audio), and can enforce an audio storage budget while keeping text.",
      "Complete Export creates a portable ZIP before you delete anything.",
    ]),
  },
  {
    topic: "permissions",
    question: join(["What permissions", "does Looper need?"]),
    answer: join([
      "Microphone access records your voice.",
      "Accessibility inserts text and reads selected or visible text for Edit Mode.",
      "Optional Screen Recording enables local OCR when apps hide text from Accessibility.",
      "Meeting recording can also request Screen & System Audio Recording.",
      "Looper shows a visible indicator while recording and never saves OCR screenshots.",
    ]),
  },
] as const satisfies readonly FAQCopy[];

type FAQField = "question" | "answer";

const message = (
  topic: string,
  field: FAQField,
  fallback: string,
): MessageDescriptor => ({
  id: `faq.${topic}.${field}`,
  message: fallback,
});

export const FAQ_MESSAGE_IDS = FAQ_COPY.flatMap(({ topic }) => [
  `faq.${topic}.question`,
  `faq.${topic}.answer`,
]);

export function FAQContent() {
  const { i18n } = useLingui();
  return (
    <div className="space-y-8">
      {FAQ_COPY.map(({ topic, question, answer }, index) => (
        <section key={topic}>
          <h3 className="ui-text-body-lg-strong ui-color-primary mb-2">
            {i18n._(message(topic, "question", question))}
          </h3>
          <div className="ui-text-body leading-relaxed ui-color-secondary">
            {i18n._(message(topic, "answer", answer))}
          </div>
          {index + 1 < FAQ_COPY.length ? (
            <div className="border-t border-border-primary mt-6" />
          ) : null}
        </section>
      ))}
    </div>
  );
}
