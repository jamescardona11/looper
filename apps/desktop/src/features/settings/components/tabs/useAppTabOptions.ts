import { useLingui } from "@lingui/react/macro";
import { buildAppLocaleOptions } from "../../../../shared/lib/appLocales";
import type {
  AutoDeleteTarget,
  RecordingPrunePolicy,
  TextSizeMode,
  ThemeMode,
} from "../../../../types";

export type SelectOption<T> = { value: T; label: string };

export function useAppTabOptions() {
  const { t } = useLingui();
  const textSize: SelectOption<TextSizeMode>[] = [
    {
      value: "small",
      label: t({ id: "settings.app.text_size.small", message: "Small" }),
    },
    {
      value: "default",
      label: t({ id: "settings.app.text_size.default", message: "Default" }),
    },
    {
      value: "large",
      label: t({ id: "settings.app.text_size.large", message: "Large" }),
    },
  ];
  const themes: SelectOption<ThemeMode>[] = [
    {
      value: "system",
      label: t({ id: "settings.app.theme.system", message: "System" }),
    },
    {
      value: "light",
      label: t({ id: "settings.app.theme.light", message: "Light" }),
    },
    {
      value: "dark",
      label: t({ id: "settings.app.theme.dark", message: "Dark" }),
    },
  ];
  const prunePolicies: SelectOption<RecordingPrunePolicy>[] = [
    {
      value: "never",
      label: t({ id: "settings.app.prune.never", message: "Never" }),
    },
    {
      value: "immediately",
      label: t({ id: "settings.app.prune.instantly", message: "Instantly" }),
    },
    {
      value: "day",
      label: t({ id: "settings.app.prune.day", message: "A Day" }),
    },
    {
      value: "week",
      label: t({ id: "settings.app.prune.week", message: "A Week" }),
    },
    {
      value: "month",
      label: t({ id: "settings.app.prune.month", message: "A Month" }),
    },
    {
      value: "year",
      label: t({ id: "settings.app.prune.year", message: "A Year" }),
    },
  ];
  const pruneTargets: SelectOption<AutoDeleteTarget>[] = [
    {
      value: "audio",
      label: t({ id: "settings.app.prune_target.audio", message: "Audio" }),
    },
    {
      value: "transcripts",
      label: t({
        id: "settings.app.prune_target.transcripts",
        message: "Transcripts",
      }),
    },
  ];
  const audioBudgets: SelectOption<number>[] = [
    {
      value: 0,
      label: t({
        id: "settings.app.audio_budget.unlimited",
        message: "No limit",
      }),
    },
    { value: 256, label: "256 MB" },
    { value: 512, label: "512 MB" },
    { value: 1024, label: "1 GB" },
    { value: 2048, label: "2 GB" },
    { value: 5120, label: "5 GB" },
    { value: 10240, label: "10 GB" },
  ];

  return {
    appLanguages: buildAppLocaleOptions(
      t({ id: "settings.app.language.system", message: "System" }),
    ),
    audioBudgets,
    prunePolicies,
    pruneTargets,
    textSize,
    themes,
  };
}
