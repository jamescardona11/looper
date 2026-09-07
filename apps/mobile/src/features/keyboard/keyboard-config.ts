import type { DictionaryEntry, ReplacementRule, UserSnippet } from "@looper/data";

export interface KeyboardTerm {
  sourceValue: string;
  destinationValue: string;
  isReplacement: boolean;
}

export interface KeyboardSnippet {
  trigger: string;
  expansion: string;
}

export interface KeyboardTone {
  name: string;
  promptTemplate: string;
}

export interface KeyboardWorkflow {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: "manual" | "bundle_id";
  triggerValue: string;
  input: "dictation";
  engine: "auto";
  language: string | null;
  transformPreset: null;
  customPrompt: string;
  deterministicOnly: boolean;
  output: "insert";
  autoSendOnInsert: boolean;
}

export interface KeyboardSyncPayload {
  convexUrl: string;
  refreshToken: string | null;
  localSttModelPath: string | null;
  transcriptionMode: "cloud" | "local";
  termIds: string[];
  termById: Record<string, KeyboardTerm>;
  snippets: KeyboardSnippet[];
  activeToneIds: string[];
  toneById: Record<string, KeyboardTone>;
  selectedToneId: string | null;
  smartModeRules: KeyboardWorkflow[];
  widgetSummary?: {
    lastCaptureDetail: string;
    lastCaptureTitle: string | null;
    weeklyWordCount: number;
  };
}

export function buildKeyboardSyncPayload({
  convexUrl,
  refreshToken,
  entries,
  localSttModelPath,
  replacements,
  snippets,
  activeToneIds = [],
  toneById = {},
  selectedToneId = null,
  smartModeRules = [],
  widgetSummary,
}: {
  convexUrl: string;
  refreshToken: string | null;
  entries: DictionaryEntry[];
  localSttModelPath: string | null;
  replacements: ReplacementRule[];
  snippets: UserSnippet[];
  activeToneIds?: string[];
  toneById?: Record<string, KeyboardTone>;
  selectedToneId?: string | null;
  smartModeRules?: KeyboardWorkflow[];
  widgetSummary?: KeyboardSyncPayload["widgetSummary"];
}): KeyboardSyncPayload {
  const terms = [
    ...entries.map(
      (entry) =>
        [
          entry.id,
          { sourceValue: entry.term, destinationValue: entry.term, isReplacement: false },
        ] as const,
    ),
    ...replacements.map(
      (rule) =>
        [
          rule.id,
          { sourceValue: rule.source, destinationValue: rule.destination, isReplacement: true },
        ] as const,
    ),
  ];

  return {
    convexUrl,
    refreshToken,
    localSttModelPath,
    transcriptionMode: localSttModelPath ? "local" : "cloud",
    termIds: terms.map(([id]) => id),
    termById: Object.fromEntries(terms),
    snippets: snippets.map(({ trigger, expansion }) => ({ trigger, expansion })),
    activeToneIds,
    toneById,
    selectedToneId,
    smartModeRules,
    widgetSummary,
  };
}
