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

type PreferenceFields<Names extends PropertyKey, Value> = {
  [Name in Names]: Value;
};

type ApplicationFlags =
  | "onboarding_completed"
  | "auto_update_enabled"
  | "auto_launch_enabled"
  | "start_in_background"
  | "calendar_meeting_awareness_enabled"
  | "microphone_meeting_awareness_enabled"
  | "hide_overlays_from_capture"
  | "analytics_enabled";

export type ApplicationPreferences = PreferenceFields<
  ApplicationFlags,
  boolean
> &
  PreferenceFields<"language" | "analytics_install_id", string> & {
    app_locale: AppLocaleSetting;
    theme_mode: ThemeMode;
  };

type ShortcutNames = "smart_shortcut" | "hold_shortcut" | "toggle_shortcut";
type ShortcutFlags = "smart_enabled" | "hold_enabled" | "toggle_enabled";

export type ShortcutPreferences = PreferenceFields<ShortcutNames, string> &
  PreferenceFields<ShortcutFlags, boolean> & {
    shortcut_bindings: ShortcutBindings;
  };

type SpeechTextFields =
  | "local_model"
  | "remote_speech_endpoint"
  | "remote_speech_api_key"
  | "remote_speech_model";

export type SpeechPreferences = PreferenceFields<SpeechTextFields, string> & {
  transcription_mode: TranscriptionMode;
  remote_speech_enabled: boolean;
  remote_speech_provider: RemoteSpeechProvider;
  microphone_device: string | null;
  media_action: MediaAction;
};

type IntelligenceTextFields =
  "llm_endpoint" | "llm_api_key" | "llm_model" | "local_llm_model";

export type IntelligencePreferences = PreferenceFields<
  IntelligenceTextFields,
  string
> &
  PreferenceFields<"llm_enabled" | "cleanup_enabled", boolean> & {
    llm_provider: LlmProvider;
    meeting_ai_provider: MeetingAiProvider;
  };

type PersonalizationFlags =
  | "auto_dictionary_enabled"
  | "edit_mode_enabled"
  | "preview_before_insert_enabled"
  | "preview_before_insert_selection_enabled"
  | "use_screen_context";

export type PersonalizationPreferences = PreferenceFields<
  PersonalizationFlags,
  boolean
> & {
  dictionary: string[];
  auto_dictionary_ignored: string[];
  replacements: Replacement[];
  user_snippets: UserSnippet[];
  personalities: Personality[];
  mode_rules: ModeRule[];
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
