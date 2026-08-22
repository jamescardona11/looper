import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { buildAppLocaleOptions } from "../../../shared/lib/appLocales";
import type {
  AutoDeleteTarget,
  RecordingPrunePolicy,
  TextSizeMode,
  ThemeMode,
} from "../../../contracts/index";

export type SelectOption<T> = { value: T; label: string };

const optionCopy = {
  textSize: {
    small: msg({ id: "settings.app.text_size.small", message: "Small" }),
    default: msg({ id: "settings.app.text_size.default", message: "Default" }),
    large: msg({ id: "settings.app.text_size.large", message: "Large" }),
  },
  theme: {
    system: msg({ id: "settings.app.theme.system", message: "System" }),
    light: msg({ id: "settings.app.theme.light", message: "Light" }),
    dark: msg({ id: "settings.app.theme.dark", message: "Dark" }),
  },
  prune: {
    never: msg({ id: "settings.app.prune.never", message: "Never" }),
    immediately: msg({
      id: "settings.app.prune.instantly",
      message: "Instantly",
    }),
    day: msg({ id: "settings.app.prune.day", message: "A Day" }),
    week: msg({ id: "settings.app.prune.week", message: "A Week" }),
    month: msg({ id: "settings.app.prune.month", message: "A Month" }),
    year: msg({ id: "settings.app.prune.year", message: "A Year" }),
  },
  target: {
    audio: msg({ id: "settings.app.prune_target.audio", message: "Audio" }),
    transcripts: msg({
      id: "settings.app.prune_target.transcripts",
      message: "Transcripts",
    }),
  },
  systemLanguage: msg({
    id: "settings.app.language.system",
    message: "System",
  }),
  unlimitedStorage: msg({
    id: "settings.app.audio_budget.unlimited",
    message: "No limit",
  }),
} as const;

const orderedValues = {
  textSize: ["small", "default", "large"],
  themes: ["system", "light", "dark"],
  prune: ["never", "immediately", "day", "week", "month", "year"],
  target: ["audio", "transcripts"],
  audioMb: [0, 256, 512, 1024, 2048, 5120, 10240],
} as const satisfies {
  textSize: readonly TextSizeMode[];
  themes: readonly ThemeMode[];
  prune: readonly RecordingPrunePolicy[];
  target: readonly AutoDeleteTarget[];
  audioMb: readonly number[];
};

function translatedOptions<
  Value extends string,
  Copy extends Record<Value, unknown>,
>(
  values: readonly Value[],
  copy: Copy,
  translate: (copy: Copy[Value]) => string,
) {
  return values.map((value) => ({ value, label: translate(copy[value]) }));
}

function audioBudgetLabel(value: number, unlimited: string) {
  if (value === 0) return unlimited;
  return value < 1024 ? `${value} MB` : `${value / 1024} GB`;
}

export function buildAppTabOptions(
  translate: (copy: MessageDescriptor) => string,
) {
  return {
    appLanguages: buildAppLocaleOptions(translate(optionCopy.systemLanguage)),
    audioBudgets: orderedValues.audioMb.map((value) => ({
      value,
      label: audioBudgetLabel(value, translate(optionCopy.unlimitedStorage)),
    })),
    prunePolicies: translatedOptions(
      orderedValues.prune,
      optionCopy.prune,
      translate,
    ),
    pruneTargets: translatedOptions(
      orderedValues.target,
      optionCopy.target,
      translate,
    ),
    textSize: translatedOptions(
      orderedValues.textSize,
      optionCopy.textSize,
      translate,
    ),
    themes: translatedOptions(
      orderedValues.themes,
      optionCopy.theme,
      translate,
    ),
  };
}

export function useAppTabOptions() {
  const { i18n } = useLingui();
  return buildAppTabOptions((copy) => i18n._(copy));
}
