import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";

import { LOCAL_LLM_MODEL_ID } from "../../../data/models/local-llm";
import {
  parseTextSizeMode,
  TEXT_SIZE_MODE_STORAGE_KEY,
} from "../../../shared/lib/textSize";
import type {
  AppLocaleSetting,
  AutoDeleteTarget,
  LlmProvider,
  MediaAction,
  MeetingAiProvider,
  RecordingPrunePolicy,
  RemoteSpeechProvider,
  StoredSettings,
  TextSizeMode,
  ThemeMode,
  TranscriptionMode,
} from "../../../contracts/index";

export type SettingsDraft = {
  transcriptionMode: TranscriptionMode;
  localModel: string;
  remoteSpeechEnabled: boolean;
  remoteSpeechProvider: RemoteSpeechProvider;
  remoteSpeechEndpoint: string;
  remoteSpeechApiKey: string;
  remoteSpeechModel: string;
  microphoneDevice: string | null;
  language: string;
  appLocale: AppLocaleSetting;
  llmEnabled: boolean;
  llmProvider: LlmProvider;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
  meetingAiProvider: MeetingAiProvider;
  localLlmModel: string;
  editModeEnabled: boolean;
  previewBeforeInsertEnabled: boolean;
  previewBeforeInsertSelectionEnabled: boolean;
  useScreenContext: boolean;
  autoDictionaryEnabled: boolean;
  mediaAction: MediaAction;
  autoUpdateEnabled: boolean;
  autoLaunchEnabled: boolean;
  startInBackground: boolean;
  calendarMeetingAwarenessEnabled: boolean;
  microphoneMeetingAwarenessEnabled: boolean;
  meetingSystemAudioEnabled: boolean;
  meetingLiveTranscriptEnabled: boolean;
  autoDeleteTarget: AutoDeleteTarget;
  autoDeleteDuration: RecordingPrunePolicy;
  audioStorageBudgetMb: number;
  hideOverlaysFromCapture: boolean;
  markdownMirrorEnabled: boolean;
  markdownMirrorPath: string;
  analyticsEnabled: boolean;
  textSizeMode: TextSizeMode;
  themeMode: ThemeMode;
};

type DraftSetter<K extends keyof SettingsDraft> = (
  value: SetStateAction<SettingsDraft[K]>,
) => void;

export function useSettingsDraft(initialTranscriptionMode: TranscriptionMode) {
  const [draft, setDraft] = useState<SettingsDraft>(() =>
    createInitialSettingsDraft(initialTranscriptionMode),
  );
  const draftRef = useRef(draft);

  const commit = useCallback(
    (update: (current: SettingsDraft) => SettingsDraft) => {
      const current = draftRef.current;
      const next = update(current);
      if (Object.is(current, next)) return false;
      draftRef.current = next;
      setDraft(next);
      return true;
    },
    [],
  );

  const setField = useCallback(
    <K extends keyof SettingsDraft>(
      field: K,
      value: SetStateAction<SettingsDraft[K]>,
    ) => {
      commit((current) => {
        const nextValue =
          typeof value === "function"
            ? (value as (previous: SettingsDraft[K]) => SettingsDraft[K])(
                current[field],
              )
            : value;
        return Object.is(current[field], nextValue)
          ? current
          : { ...current, [field]: nextValue };
      });
    },
    [commit],
  );

  const hydrate = useCallback(
    (settings: StoredSettings, previous?: StoredSettings) => {
      return commit((current) => {
        const next = draftFromStoredSettings(settings, current.textSizeMode);
        if (!previous) {
          return settingsDraftsAreEqual(current, next) ? current : next;
        }

        const baseline = draftFromStoredSettings(
          previous,
          current.textSizeMode,
        );
        const merged = mergeCleanDraftFields(current, baseline, next);
        return settingsDraftsAreEqual(current, merged) ? current : merged;
      });
    },
    [commit],
  );

  const setters = useMemo(() => createDraftSetters(setField), [setField]);

  return { draft, setters, hydrate };
}

function mergeCleanDraftFields(
  current: SettingsDraft,
  baseline: SettingsDraft,
  incoming: SettingsDraft,
): SettingsDraft {
  const merged = { ...current };
  for (const field of Object.keys(incoming) as Array<keyof SettingsDraft>) {
    if (Object.is(current[field], baseline[field])) {
      Object.assign(merged, { [field]: incoming[field] });
    }
  }
  return merged;
}

function settingsDraftsAreEqual(
  current: SettingsDraft,
  next: SettingsDraft,
): boolean {
  return (Object.keys(next) as Array<keyof SettingsDraft>).every((field) =>
    Object.is(current[field], next[field]),
  );
}

export function draftFromStoredSettings(
  settings: StoredSettings,
  textSizeMode: TextSizeMode,
): SettingsDraft {
  const autoLaunchEnabled = settings.auto_launch_enabled ?? false;
  return {
    transcriptionMode: settings.transcription_mode,
    localModel: settings.local_model,
    remoteSpeechEnabled: settings.remote_speech_enabled ?? false,
    remoteSpeechProvider: settings.remote_speech_provider ?? "openai",
    remoteSpeechEndpoint:
      settings.remote_speech_endpoint ?? "https://api.openai.com/v1",
    remoteSpeechApiKey: settings.remote_speech_api_key ?? "",
    remoteSpeechModel: settings.remote_speech_model ?? "auto",
    microphoneDevice: settings.microphone_device,
    language: settings.language,
    appLocale: settings.app_locale ?? "system",
    llmEnabled: settings.llm_enabled ?? false,
    llmProvider: settings.llm_provider ?? "none",
    llmEndpoint: settings.llm_endpoint ?? "",
    llmApiKey: settings.llm_api_key ?? "",
    llmModel: settings.llm_model ?? "",
    meetingAiProvider: settings.meeting_ai_provider ?? "writing",
    localLlmModel: settings.local_llm_model ?? LOCAL_LLM_MODEL_ID,
    editModeEnabled: settings.edit_mode_enabled ?? false,
    previewBeforeInsertEnabled: settings.preview_before_insert_enabled ?? false,
    previewBeforeInsertSelectionEnabled:
      settings.preview_before_insert_selection_enabled ?? true,
    useScreenContext: settings.use_screen_context ?? false,
    autoDictionaryEnabled: settings.auto_dictionary_enabled ?? false,
    mediaAction: settings.media_action ?? "off",
    autoUpdateEnabled: settings.auto_update_enabled ?? false,
    autoLaunchEnabled,
    startInBackground:
      autoLaunchEnabled && (settings.start_in_background ?? false),
    calendarMeetingAwarenessEnabled:
      settings.calendar_meeting_awareness_enabled ?? false,
    microphoneMeetingAwarenessEnabled:
      settings.microphone_meeting_awareness_enabled ?? true,
    meetingSystemAudioEnabled: settings.meeting_system_audio_enabled ?? true,
    meetingLiveTranscriptEnabled:
      settings.meeting_live_transcript_enabled ?? true,
    autoDeleteTarget: settings.auto_delete_target ?? "transcripts",
    autoDeleteDuration: settings.auto_delete_duration ?? "never",
    audioStorageBudgetMb: settings.audio_storage_budget_mb ?? 0,
    hideOverlaysFromCapture: settings.hide_overlays_from_capture ?? false,
    markdownMirrorEnabled: settings.markdown_mirror_enabled ?? false,
    markdownMirrorPath: settings.markdown_mirror_path ?? "",
    analyticsEnabled: settings.analytics_enabled ?? true,
    textSizeMode,
    themeMode: settings.theme_mode ?? "system",
  };
}

function createInitialSettingsDraft(
  transcriptionMode: TranscriptionMode,
): SettingsDraft {
  return {
    transcriptionMode,
    localModel: "",
    remoteSpeechEnabled: false,
    remoteSpeechProvider: "openai",
    remoteSpeechEndpoint: "https://api.openai.com/v1",
    remoteSpeechApiKey: "",
    remoteSpeechModel: "auto",
    microphoneDevice: null,
    language: "en",
    appLocale: "system",
    llmEnabled: false,
    llmProvider: "none",
    llmEndpoint: "",
    llmApiKey: "",
    llmModel: "",
    meetingAiProvider: "writing",
    localLlmModel: LOCAL_LLM_MODEL_ID,
    editModeEnabled: false,
    previewBeforeInsertEnabled: false,
    previewBeforeInsertSelectionEnabled: true,
    useScreenContext: false,
    autoDictionaryEnabled: false,
    mediaAction: "off",
    autoUpdateEnabled: false,
    autoLaunchEnabled: false,
    startInBackground: false,
    calendarMeetingAwarenessEnabled: false,
    microphoneMeetingAwarenessEnabled: true,
    meetingSystemAudioEnabled: true,
    meetingLiveTranscriptEnabled: true,
    autoDeleteTarget: "transcripts",
    autoDeleteDuration: "never",
    audioStorageBudgetMb: 0,
    hideOverlaysFromCapture: false,
    markdownMirrorEnabled: false,
    markdownMirrorPath: "",
    analyticsEnabled: true,
    textSizeMode: parseTextSizeMode(
      localStorage.getItem(TEXT_SIZE_MODE_STORAGE_KEY),
    ),
    themeMode: "system",
  };
}

function createDraftSetters(
  setField: <K extends keyof SettingsDraft>(
    field: K,
    value: SetStateAction<SettingsDraft[K]>,
  ) => void,
) {
  const bind =
    <K extends keyof SettingsDraft>(field: K): DraftSetter<K> =>
    (value) =>
      setField(field, value);

  return {
    transcriptionMode: bind("transcriptionMode"),
    localModel: bind("localModel"),
    remoteSpeechEnabled: bind("remoteSpeechEnabled"),
    remoteSpeechProvider: bind("remoteSpeechProvider"),
    remoteSpeechEndpoint: bind("remoteSpeechEndpoint"),
    remoteSpeechApiKey: bind("remoteSpeechApiKey"),
    remoteSpeechModel: bind("remoteSpeechModel"),
    microphoneDevice: bind("microphoneDevice"),
    language: bind("language"),
    appLocale: bind("appLocale"),
    llmEnabled: bind("llmEnabled"),
    llmProvider: bind("llmProvider"),
    llmEndpoint: bind("llmEndpoint"),
    llmApiKey: bind("llmApiKey"),
    llmModel: bind("llmModel"),
    meetingAiProvider: bind("meetingAiProvider"),
    localLlmModel: bind("localLlmModel"),
    editModeEnabled: bind("editModeEnabled"),
    previewBeforeInsertEnabled: bind("previewBeforeInsertEnabled"),
    previewBeforeInsertSelectionEnabled: bind(
      "previewBeforeInsertSelectionEnabled",
    ),
    useScreenContext: bind("useScreenContext"),
    autoDictionaryEnabled: bind("autoDictionaryEnabled"),
    mediaAction: bind("mediaAction"),
    autoUpdateEnabled: bind("autoUpdateEnabled"),
    autoLaunchEnabled: bind("autoLaunchEnabled"),
    startInBackground: bind("startInBackground"),
    calendarMeetingAwarenessEnabled: bind("calendarMeetingAwarenessEnabled"),
    microphoneMeetingAwarenessEnabled: bind(
      "microphoneMeetingAwarenessEnabled",
    ),
    meetingSystemAudioEnabled: bind("meetingSystemAudioEnabled"),
    meetingLiveTranscriptEnabled: bind("meetingLiveTranscriptEnabled"),
    autoDeleteTarget: bind("autoDeleteTarget"),
    autoDeleteDuration: bind("autoDeleteDuration"),
    audioStorageBudgetMb: bind("audioStorageBudgetMb"),
    hideOverlaysFromCapture: bind("hideOverlaysFromCapture"),
    markdownMirrorEnabled: bind("markdownMirrorEnabled"),
    markdownMirrorPath: bind("markdownMirrorPath"),
    analyticsEnabled: bind("analyticsEnabled"),
    textSizeMode: bind("textSizeMode"),
    themeMode: bind("themeMode"),
  };
}
