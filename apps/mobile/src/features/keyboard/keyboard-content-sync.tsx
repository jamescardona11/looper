import {
  useDictationDictionary,
  useDictationReplacements,
  useDictationSettings,
  useDictationSnippets,
  useMeetingSessions,
  useNotes,
} from "@looper/data";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { normalizeStudioSettings } from "@/shared/studio/studio-settings";
import { isNativeKeyboardAvailable } from "./native-keyboard";
import { syncKeyboardContent } from "./sync-keyboard-content";
import { buildWidgetSummary } from "../library/widget-summary";

export function KeyboardContentSync({ children }: { children: ReactNode }) {
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const snippets = useDictationSnippets();
  const settings = useDictationSettings();
  const notes = useNotes();
  const meetings = useMeetingSessions();
  const studio = useMemo(() => normalizeStudioSettings(settings.doc?.data), [settings.doc?.data]);
  const lastSynced = useRef<string | null>(null);
  const isLoading =
    dictionary.isLoading || replacements.isLoading || snippets.isLoading || settings.isLoading || notes.isLoading || meetings.isLoading;
  const widgetSummary = useMemo(
    () => buildWidgetSummary(notes.notes, meetings.sessions),
    [meetings.sessions, notes.notes],
  );
  const signature = JSON.stringify({
    dictionary: dictionary.entries,
    replacements: replacements.rules,
    snippets: snippets.snippets,
    studio,
    widgetSummary,
  });

  useEffect(() => {
    if (isLoading || !isNativeKeyboardAvailable() || lastSynced.current === signature) return;
    const timeout = setTimeout(() => {
      void syncKeyboardContent({
        entries: dictionary.entries,
        replacements: replacements.rules,
        snippets: snippets.snippets,
        studio,
        widgetSummary,
      })
        .then((didSync) => {
          if (didSync) lastSynced.current = signature;
        })
        .catch((cause: unknown) => {
          if (__DEV__) console.warn("Automatic keyboard sync failed", cause);
        });
    }, 250);
    return () => clearTimeout(timeout);
  }, [dictionary.entries, isLoading, replacements.rules, signature, snippets.snippets, studio, widgetSummary]);

  return children;
}
