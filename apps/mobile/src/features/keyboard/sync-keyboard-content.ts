import type { DictionaryEntry, ReplacementRule, UserSnippet } from "@looper/data";
import type { MeetingSession, Note } from "@looper/data";
import { getConvexRefreshToken } from "@/lib/secure-storage";
import { type MobileStudioSettings, smartModePrompt } from "@/shared/studio/studio-settings";
import { buildKeyboardSyncPayload } from "./keyboard-config";
import { syncNativeKeyboard } from "./native-keyboard";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

export async function syncKeyboardContent({
  entries,
  replacements,
  snippets,
  studio,
  widgetSummary,
}: {
  entries: DictionaryEntry[];
  replacements: ReplacementRule[];
  snippets: UserSnippet[];
  studio: MobileStudioSettings;
  widgetSummary: {
    lastCaptureDetail: string;
    lastCaptureTitle: string | null;
    weeklyWordCount: number;
  };
}): Promise<boolean> {
  if (!convexUrl) return false;
  // La extensión vive en otro sandbox: no puede abrir el modelo local del host.
  // Evitamos consultar ese runtime durante cada sincronización y declaramos cloud
  // de forma explícita hasta que exista un modelo empaquetado para la extensión.
  const refreshToken = await getConvexRefreshToken(convexUrl);
  await syncNativeKeyboard(
    buildKeyboardSyncPayload({
      convexUrl,
      refreshToken,
      localSttModelPath: null,
      entries,
      replacements,
      snippets,
      activeToneIds: studio.styles.map((style) => style.id),
      toneById: Object.fromEntries(
        studio.styles.map((style) => [
          style.id,
          { name: style.name, promptTemplate: style.promptTemplate },
        ]),
      ),
      selectedToneId: studio.activeStyleId,
      smartModeRules: studio.smartModes.map((mode) => ({
        id: mode.id,
        name: mode.name,
        enabled: mode.enabled,
        triggerType: mode.triggerType,
        triggerValue: mode.triggerValue,
        input: "dictation",
        engine: "auto",
        language: studio.language ?? null,
        transformPreset: null,
        customPrompt: smartModePrompt(mode, studio.styles),
        deterministicOnly: false,
        output: "insert",
        autoSendOnInsert: false,
      })),
      widgetSummary,
    }),
  );
  return true;
}
