import { X } from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useMountEffect } from "../hooks/useMountEffect";

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ScrollEdges = {
  top: boolean;
  bottom: boolean;
};

const NO_SCROLL_EDGES: ScrollEdges = { top: false, bottom: false };

function createScrollEdgeStore() {
  let element: HTMLDivElement | null = null;
  let observer: ResizeObserver | null = null;
  let snapshot = NO_SCROLL_EDGES;
  const listeners = new Set<() => void>();

  const measure = () => {
    if (!element) return;
    const next = {
      top: element.scrollTop > 1,
      bottom:
        element.scrollTop + element.clientHeight < element.scrollHeight - 1,
    };
    if (next.top === snapshot.top && next.bottom === snapshot.bottom) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const detach = () => {
    element?.removeEventListener("scroll", measure);
    observer?.disconnect();
    observer = null;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setElement: (next: HTMLDivElement | null) => {
      if (element === next) return;
      detach();
      element = next;
      if (!element) {
        snapshot = NO_SCROLL_EDGES;
        return;
      }
      element.addEventListener("scroll", measure, { passive: true });
      if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(measure);
        observer.observe(element);
      }
      measure();
    },
  };
}

function useScrollEdges() {
  const store = useMemo(createScrollEdgeStore, []);
  const edges = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => NO_SCROLL_EDGES,
  );
  return { edges, scrollRef: store.setElement };
}

function FAQItems() {
  const { t } = useLingui();
  const items: Array<{ id: string; question: string; answer: ReactNode }> = [
    {
      id: "how-it-works",
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
      id: "privacy",
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
      id: "ai-writing",
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
      id: "free",
      question: t({
        id: "faq.free.question",
        message: "What is free vs Looper Personal?",
      }),
      answer: t({
        id: "faq.free.answer",
        message:
          "Core dictation is free: local transcription, dictionary, replacements, and history. There are no per-minute fees or subscriptions for that. Library, AI Cleanup, Edit Mode, personalization with an LLM, and the CLI are part of Looper Personal. You get a 14-day trial first; after that, activate a Personal license (a one-time purchase) or a Commercial license (billed yearly) in Settings → Account.",
      }),
    },
    {
      id: "delete",
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
      id: "permissions",
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
  ];

  return (
    <div className="space-y-8">
      {items.map((item, index) => (
        <section key={item.id}>
          <h3 className="ui-text-body-lg-strong ui-color-primary mb-2">
            {item.question}
          </h3>
          <div className="ui-text-body leading-relaxed ui-color-secondary">
            {item.answer}
          </div>
          {index < items.length - 1 ? (
            <div className="border-t border-border-primary mt-6" />
          ) : null}
        </section>
      ))}
    </div>
  );
}

export default function FAQModal({ isOpen, onClose }: FAQModalProps) {
  const { t } = useLingui();
  const { edges, scrollRef } = useScrollEdges();
  const openRef = useRef(isOpen);
  const closeRef = useRef(onClose);
  openRef.current = isOpen;
  closeRef.current = onClose;

  useMountEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) closeRef.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });

  const keepDialogOpen = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="faq-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={keepDialogOpen}
            className="relative w-full max-w-lg h-[85vh] bg-surface-tertiary rounded-2xl border border-border-secondary shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-7 pt-6 pb-4 shrink-0">
              <div>
                <h2
                  id="faq-title"
                  className="ui-text-display font-normal ui-color-primary tracking-tight"
                >
                  {t({
                    id: "faq.title",
                    message: "Frequently Asked Questions",
                  })}
                </h2>
                <p className="ui-text-meta ui-color-muted mt-1">
                  {t({
                    id: "faq.subtitle",
                    message: "How Looper works, privacy, and AI writing",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-elevated transition-colors outline-hidden focus-visible:[box-shadow:var(--focus-ring)]"
                aria-label={t({
                  id: "faq.close_aria",
                  message: "Close FAQ",
                })}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="relative flex-1 min-h-0 overflow-hidden">
              <div
                className={`pointer-events-none absolute left-0 right-3 top-0 h-6 z-10 transition-opacity duration-150 ${edges.top ? "opacity-100" : "opacity-0"}`}
                style={{
                  background:
                    "linear-gradient(to bottom, var(--color-bg-tertiary), transparent)",
                }}
                aria-hidden="true"
              />
              <div
                className={`pointer-events-none absolute left-0 right-3 bottom-0 h-8 z-10 transition-opacity duration-150 ${edges.bottom ? "opacity-100" : "opacity-0"}`}
                style={{
                  background:
                    "linear-gradient(to top, var(--color-bg-tertiary), transparent)",
                }}
                aria-hidden="true"
              />
              <div
                ref={scrollRef}
                className="h-full overflow-y-auto settings-scroll px-7 pb-8"
              >
                <FAQItems />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
