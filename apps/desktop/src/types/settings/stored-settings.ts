import type { Personality, Replacement, UserSnippet } from "./personalization";
import type {
  AppLocaleSetting,
  AutoDeleteTarget,
  LlmProvider,
  MediaAction,
  MeetingAiProvider,
  RecordingPrunePolicy,
  RemoteSpeechProvider,
  ThemeMode,
  TranscriptionMode,
} from "./preferences";
import type { ShortcutBindings } from "./shortcuts";
import type { ModeRule } from "./workflows";

export type ApplicationPreferences = {
  onboarding_completed: boolean;
  language: string;
  app_locale: AppLocaleSetting;
  theme_mode: ThemeMode;
  auto_update_enabled: boolean;
  auto_launch_enabled: boolean;
  start_in_background: boolean;
  calendar_meeting_awareness_enabled: boolean;
  hide_overlays_from_capture: boolean;
  analytics_enabled: boolean;
  analytics_install_id: string;
};

export type ShortcutPreferences = {
  smart_shortcut: string;
  smart_enabled: boolean;
  hold_shortcut: string;
  hold_enabled: boolean;
  toggle_shortcut: string;
  toggle_enabled: boolean;
  shortcut_bindings: ShortcutBindings;
};

export type SpeechPreferences = {
  transcription_mode: TranscriptionMode;
  local_model: string;
  remote_speech_enabled: boolean;
  remote_speech_provider: RemoteSpeechProvider;
  remote_speech_endpoint: string;
  remote_speech_api_key: string;
  remote_speech_model: string;
  microphone_device: string | null;
  media_action: MediaAction;
};

export type IntelligencePreferences = {
  llm_enabled: boolean;
  cleanup_enabled: boolean;
  llm_provider: LlmProvider;
  llm_endpoint: string;
  llm_api_key: string;
  llm_model: string;
  meeting_ai_provider: MeetingAiProvider;
  local_llm_model: string;
};

export type PersonalizationPreferences = {
  dictionary: string[];
  auto_dictionary_enabled: boolean;
  auto_dictionary_ignored: string[];
  replacements: Replacement[];
  user_snippets: UserSnippet[];
  personalities: Personality[];
  mode_rules: ModeRule[];
  edit_mode_enabled: boolean;
  preview_before_insert_enabled: boolean;
  preview_before_insert_selection_enabled: boolean;
  use_screen_context: boolean;
};

export type StoragePreferences = {
  auto_delete_target: AutoDeleteTarget;
  auto_delete_duration: RecordingPrunePolicy;
  audio_storage_budget_mb: number;
  markdown_mirror_enabled: boolean;
  markdown_mirror_path: string;
};

export type StoredSettings = ApplicationPreferences &
  ShortcutPreferences &
  SpeechPreferences &
  IntelligencePreferences &
  PersonalizationPreferences &
  StoragePreferences;
