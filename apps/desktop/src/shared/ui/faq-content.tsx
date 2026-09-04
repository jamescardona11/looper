import { useLingui } from "@lingui/react/macro";

type FAQCopy = Readonly<{
  topic: string;
  question: string;
  answer: string;
}>;

export const FAQ_MESSAGE_IDS = [
  "faq.how_it_works.question",
  "faq.how_it_works.answer",
  "faq.privacy.question",
  "faq.privacy.answer",
  "faq.ai_writing.question",
  "faq.ai_writing.answer",
  "faq.free_launch.question",
  "faq.free_launch.answer",
  "faq.delete.question",
  "faq.delete.answer",
  "faq.permissions.question",
  "faq.permissions.answer",
] as const;

export function FAQContent() {
  const { t } = useLingui();
  const faqCopy = [
    {
      topic: "how_it_works",
      question: t({
        id: "faq.how_it_works.question",
        message: "How does Looper work?",
      }),
      answer: t({
        id: "faq.how_it_works.answer",
        message:
          "Press your dictation shortcut, speak, and release. Local mode transcribes on your device and works offline. Cloud mode sends the recording to Looper Cloud. Both insert the result where your cursor is.",
      }),
    },
    {
      topic: "privacy",
      question: t({
        id: "faq.privacy.question",
        message: "Where does my data go?",
      }),
      answer: t({
        id: "faq.privacy.answer",
        message:
          "In Local mode, audio and transcripts stay on your computer. In Cloud mode, audio is uploaded for transcription and deleted after the request; the transcript is stored locally. History sync is separate, off by default, and uploads transcript text only—never audio. Optional anonymous usage analytics never include your audio or transcript and can be disabled in Settings → App.",
      }),
    },
    {
      topic: "ai_writing",
      question: t({
        id: "faq.ai_writing.question",
        message: "When does text leave my device?",
      }),
      answer: t({
        id: "faq.ai_writing.answer",
        message:
          "Only when you enable AI writing and run an AI operation. Cleanup, Edit Mode, Personalization, translations, and meeting summaries send the relevant text directly to the provider configured under Settings → Providers. Screen Context may include locally recognized text, but never a screenshot. Your API key stays stored locally in Looper.",
      }),
    },
    {
      topic: "free",
      question: t({
        id: "faq.free_launch.question",
        message: "Is Looper free to use?",
      }),
      answer: t({
        id: "faq.free_launch.answer",
        message:
          "Looper is currently free to use, including dictation, Library, AI Cleanup, Edit Mode, personalization, and the CLI. There are no subscriptions, trials, licenses, or per-minute fees during this free launch period.",
      }),
    },
    {
      topic: "delete",
      question: t({
        id: "faq.delete.question",
        message: "How do I manage or delete my data?",
      }),
      answer: t({
        id: "faq.delete.answer",
        message:
          "Delete recordings from History, remove imported files or meetings from Library, or uninstall models from Settings → Models. Settings → App can auto-delete Audio only or full Transcripts (including linked audio), and can enforce an audio storage budget while keeping text. Complete Export creates a portable ZIP before you delete anything.",
      }),
    },
    {
      topic: "permissions",
      question: t({
        id: "faq.permissions.question",
        message: "What permissions does Looper need?",
      }),
      answer: t({
        id: "faq.permissions.answer",
        message:
          "Microphone access records your voice. Accessibility inserts text and reads selected or visible text for Edit Mode. Optional Screen Recording enables local OCR when apps hide text from Accessibility. Meeting recording can also request Screen & System Audio Recording. Looper shows a visible indicator while recording and never saves OCR screenshots.",
      }),
    },
  ] satisfies readonly FAQCopy[];

  return (
    <div className="space-y-8">
      {faqCopy.map(({ topic, question, answer }, index) => (
        <section key={topic}>
          <h3 className="ui-text-body-lg-strong ui-color-primary mb-2">
            {question}
          </h3>
          <div className="ui-text-body leading-relaxed ui-color-secondary">
            {answer}
          </div>
          {index + 1 < faqCopy.length ? (
            <div className="border-t border-border-primary mt-6" />
          ) : null}
        </section>
      ))}
    </div>
  );
}
