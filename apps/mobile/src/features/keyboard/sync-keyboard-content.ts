import type { DictionaryEntry, ReplacementRule, UserSnippet } from "@looper/data";
import { getConvexRefreshToken } from "@/lib/secure-storage";
import { type MobileStudioSettings, smartModePrompt } from "@/shared/studio/studio-settings";
import { getLocalSttModelPath } from "../dictation/local-stt-runtime";
import { buildKeyboardSyncPayload } from "./keyboard-config";
import { syncNativeKeyboard } from "./native-keyboard";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

export async function syncKeyboardContent({
  entries,
  replacements,
  snippets,
  studio,
}: {
  entries: DictionaryEntry[];
  replacements: ReplacementRule[];
  snippets: UserSnippet[];
  studio: MobileStudioSettings;
}): Promise<boolean> {
  if (!convexUrl) return false;
  const [refreshToken, localSttModelPath] = await Promise.all([
    getConvexRefreshToken(convexUrl),
    getLocalSttModelPath(),
  ]);
  await syncNativeKeyboard(
    buildKeyboardSyncPayload({
      convexUrl,
      refreshToken,
      localSttModelPath,
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
    }),
  );
  return true;
}
