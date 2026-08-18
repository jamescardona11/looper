import { useMemo, useSyncExternalStore } from "react";
import { languageTagForSpeech, splitSpeechText } from "../lib/speechPlayback";

function speechSynthesisSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

function createSpeechPlayback(
  text: string,
  language: string | null | undefined,
  supported: boolean,
) {
  let speaking = false;
  let generation = 0;
  const listeners = new Set<() => void>();

  const publish = (next: boolean) => {
    if (speaking === next) return;
    speaking = next;
    listeners.forEach((listener) => listener());
  };
  const stop = () => {
    generation += 1;
    if (supported) window.speechSynthesis.cancel();
    publish(false);
  };
  const speak = () => {
    if (!supported) return;
    const chunks = splitSpeechText(text);
    if (!chunks.length) return;

    window.speechSynthesis.cancel();
    generation += 1;
    const activeGeneration = generation;
    publish(true);

    const playChunk = (index: number) => {
      if (generation !== activeGeneration) return;
      const chunk = chunks[index];
      if (chunk === undefined) {
        publish(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = languageTagForSpeech(language);
      utterance.onend = () => playChunk(index + 1);
      utterance.onerror = () => {
        if (generation === activeGeneration) publish(false);
      };
      window.speechSynthesis.speak(utterance);
    };

    playChunk(0);
  };

  return {
    getSnapshot: () => speaking,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && speaking) stop();
      };
    },
    speak,
    stop,
  };
}

export function useSpeechPlayback(text: string, language?: string | null) {
  const supported = speechSynthesisSupported();
  const playback = useMemo(
    () => createSpeechPlayback(text, language, supported),
    [language, supported, text],
  );
  const isSpeaking = useSyncExternalStore(
    playback.subscribe,
    playback.getSnapshot,
    () => false,
  );

  return {
    supported,
    isSpeaking,
    speak: playback.speak,
    stop: playback.stop,
  };
}
