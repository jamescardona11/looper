use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use tauri::{async_runtime, AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::{
    accessibility_context, analytics, assistive, auto_dictionary, corrections, dictionary,
    llm_cleanup, mode_context, model_manager,
    model_manager::{model_supports_capability, MODEL_CAPABILITY_DICTIONARY},
    recorder::{CompletedRecording, RecordingSaved},
    remote_speech, screen_vocabulary, selection_actions,
    selection_actions::{EditAction, TransformPreset},
    settings::{ModeRule, Personality, UserSettings, WorkflowInput, WorkflowOutput},
    speech, storage, toast, transcription_api, update_checker, user_snippets, AppRuntime, AppState,
    TranscriptionCompletePayload, TranscriptionErrorPayload, EVENT_TRANSCRIPTION_COMPLETE,
    EVENT_TRANSCRIPTION_ERROR,
};

pub(crate) fn run_transcription_prune_for_settings(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> Result<()> {
    let pruner = TranscriptionPruner::new(
        app,
        crate::settings::auto_delete_transcription_policy(settings),
        chrono::Local::now(),
    );
    let count = pruner.execute(PruneAction::Delete)?;
    if count > 0 {
        app.emit(
            EVENT_TRANSCRIPTION_COMPLETE,
            TranscriptionCompletePayload {
                transcript: String::new(),
                auto_paste: false,
                record: None,
            },
        )?;
    }
    Ok(())
}

pub(crate) fn preview_transcription_prune_for_policy(
    app: &AppHandle<AppRuntime>,
    policy: crate::settings::RecordingPrunePolicy,
) -> Result<u32> {
    TranscriptionPruner::new(app, policy, chrono::Local::now()).execute(PruneAction::Count)
}

#[derive(Clone, Copy)]
enum PruneAction {
    Count,
    Delete,
}

struct TranscriptionPruner<'a> {
    app: &'a AppHandle<AppRuntime>,
    policy: crate::settings::RecordingPrunePolicy,
    now: chrono::DateTime<chrono::Local>,
}

impl<'a> TranscriptionPruner<'a> {
    fn new(
        app: &'a AppHandle<AppRuntime>,
        policy: crate::settings::RecordingPrunePolicy,
        now: chrono::DateTime<chrono::Local>,
    ) -> Self {
        Self { app, policy, now }
    }

    fn cutoff_millis(&self) -> Option<i64> {
        use crate::settings::RecordingPrunePolicy;
        match self.policy {
            RecordingPrunePolicy::Never => None,
            RecordingPrunePolicy::Immediately => Some(self.now.timestamp_millis()),
            policy => crate::settings::recording_prune_cutoff(policy, self.now)
                .map(|cutoff| cutoff.timestamp_millis()),
        }
    }

    fn execute(&self, action: PruneAction) -> Result<u32> {
        let Some(cutoff) = self.cutoff_millis() else {
            return Ok(0);
        };
        let repository = self.app.state::<AppState>().storage();
        match action {
            PruneAction::Count => repository
                .count_prunable_before(cutoff)
                .context("Failed to count prunable transcriptions"),
            PruneAction::Delete => repository
                .prune_before_and_remove_files(cutoff)
                .context("Failed to prune transcriptions"),
        }
    }
}

struct ProcessedTranscript {
    final_transcript: String,
    llm_cleaned: bool,
    pasted: bool,
}

enum ProcessTranscriptOutcome {
    Ready(ProcessedTranscript),
    Empty,
    Cancelled,
}

/// Resolution of a pending "preview before insert" gate (see
/// `AppState::begin_pending_insertion`): the user either confirmed the
/// (possibly edited) text from the pill, or cancelled the insertion.
pub(crate) enum InsertionDecision {
    Confirm(String),
    Cancel,
}

/// Resolution of Selection Mode's action-selector gate (F2, see
/// `AppState::begin_pending_edit_action`): the user either picked an action
/// (with an optional "Write Better"/"Prompt Better" preset) for the
/// transform about to run, or cancelled the whole operation.
pub(crate) enum EditActionDecision {
    Chosen {
        action: EditAction,
        preset: Option<TransformPreset>,
    },
    Cancel,
}

struct ProcessTranscriptInput<'a> {
    raw_transcript: String,
    pending_selected_text: Option<String>,
    settings: &'a UserSettings,
    active_mode: Option<&'a Personality>,
    auto_paste: bool,
    log_context: Option<&'a str>,
    cancel_token: Option<&'a CancellationToken>,
    keep_pill_expanded: bool,
    audio_duration_seconds: f32,
}

struct CompletionInput {
    raw_transcript: String,
    final_transcript: String,
    auto_paste: bool,
    audio_path: String,
    pending_path: Option<PathBuf>,
    llm_cleaned: bool,
    metadata: storage::TranscriptionMetadata,
    mode: &'static str,
    transcription_duration_seconds: f32,
    audio_source: &'static str,
    temporary: bool,
    timestamp_override: Option<chrono::DateTime<chrono::Local>>,
}

pub(crate) struct StreamingTranscriptionInput {
    pub(crate) raw_transcript: String,
    pub(crate) duration_seconds: f32,
    pub(crate) audio_path: PathBuf,
    pub(crate) pending_path: Option<PathBuf>,
    pub(crate) settings: UserSettings,
    pub(crate) active_mode: Option<Personality>,
    pub(crate) temporary: bool,
    pub(crate) cancel_token: CancellationToken,
}

struct Notice(toast::Payload);

impl Notice {
    fn new(kind: &str, message: impl Into<String>) -> Self {
        Self(toast::Payload {
            toast_type: kind.to_owned(),
            message: message.into(),
            ..Default::default()
        })
    }

    fn title(mut self, title: impl Into<String>) -> Self {
        self.0.title = Some(title.into());
        self
    }

    fn dismiss_after(mut self, milliseconds: u64) -> Self {
        self.0.auto_dismiss = Some(true);
        self.0.duration = Some(milliseconds);
        self
    }

    fn persistent(mut self) -> Self {
        self.0.auto_dismiss = Some(false);
        self
    }

    fn mode(mut self, mode: &str) -> Self {
        self.0.mode = Some(mode.to_owned());
        self
    }

    fn primary_action(mut self, action: &str, label: &str) -> Self {
        self.0.action = Some(action.to_owned());
        self.0.action_label = Some(label.to_owned());
        self
    }

    fn secondary_action(mut self, action: &str, label: &str) -> Self {
        self.0.secondary_action = Some(action.to_owned());
        self.0.secondary_action_label = Some(label.to_owned());
        self
    }

    fn emit(self, app: &AppHandle<AppRuntime>) {
        toast::emit_toast(app, self.0);
    }
}

pub(crate) fn queue_transcription(
    app: &AppHandle<AppRuntime>,
    saved: RecordingSaved,
    recording: CompletedRecording,
    settings: UserSettings,
    active_mode: Option<Personality>,
    temporary: bool,
    cancel_token: CancellationToken,
) {
    let state = app.state::<AppState>();
    state.set_pending_path(Some(saved.path.clone()));

    let pending_selected_text = state.take_pending_selected_text();
    let active_app_id = accessibility_context::get_active_context()
        .and_then(|context| context.bundle_id)
        .filter(|value| !value.trim().is_empty());
    let active_workflow = mode_context::resolve_active_mode_rule(&settings);
    // Screen-as-dictionary: claim the capture task spawned at recording
    // start (see `pill.rs`) synchronously, before a rapid next dictation
    // could replace the slot with its own capture.
    let screen_terms_task = state.take_pending_screen_terms_task();

    let http = state.http();
    let app_handle = app.clone();
    let saved_for_task = saved;
    let recording_for_task = recording;

    async_runtime::spawn(async move {
        let transcription_started_at = Instant::now();
        let audio_duration_seconds = RecordingDuration(&saved_for_task).seconds();
        let cancel_for_check = cancel_token.clone();
        let is_cancelled = move || cancel_for_check.is_cancelled();

        let auto_paste = transcription_api::auto_paste_enabled();

        tracing::info!("[transcription] mode={:?}", settings.transcription_mode,);
        accessibility_context::log_active_context();

        let model_id = speech::selected_model(&settings);
        let use_remote = remote_speech::is_remote_model(&model_id);

        // Screen-as-dictionary: join the claimed capture; it has been
        // running for the whole recording, so this await is effectively
        // free. The terms bias only this one transcription and are never
        // persisted; a failed capture yields an empty list and the current
        // behavior.
        let screen_terms = match screen_terms_task {
            Some(task) => task.await.unwrap_or_default(),
            None => Vec::new(),
        };

        let app_for_local = &app_handle;
        let settings_for_local = &settings;
        let cancel_for_local = cancel_token.clone();
        let result = speech::transcribe(
            &app_handle,
            &http,
            &settings,
            &model_id,
            &saved_for_task.path,
            &settings.local_model,
            false,
            &is_cancelled,
            |success| success,
            move || {
                transcribe_completed_recording_locally(
                    app_for_local,
                    settings_for_local,
                    recording_for_task,
                    Some(cancel_for_local),
                    use_remote,
                    screen_terms,
                )
            },
        )
        .await;

        match result {
            Ok(result) => {
                if is_cancelled() {
                    settle_cancelled_recording(
                        &app_handle,
                        saved_for_task.pending_path.as_deref(),
                        false,
                    );
                    return;
                }

                let raw_transcript = result.transcript.clone();

                if count_words(&raw_transcript) == 0 {
                    handle_empty_transcription(
                        &app_handle,
                        &saved_for_task.path,
                        saved_for_task.pending_path.as_deref(),
                    );
                    return;
                }

                if is_cancelled() {
                    settle_cancelled_recording(
                        &app_handle,
                        saved_for_task.pending_path.as_deref(),
                        false,
                    );
                    return;
                }

                if pending_selected_text.is_some() && !llm_cleanup::is_llm_available(&settings) {
                    emit_transcription_error_inner(
                        &app_handle,
                        "Edit mode requires a selected language model. Choose one in Settings -> Models."
                            .to_string(),
                        "edit_mode",
                        audio_duration_seconds,
                        "microphone",
                        saved_for_task.path.display().to_string(),
                        saved_for_task.pending_path.as_deref(),
                        true,
                        temporary,
                        true,
                    );
                    app_handle.state::<AppState>().set_pending_path(None);
                    return;
                }

                let processed = match process_transcript_text(
                    &app_handle,
                    &http,
                    ProcessTranscriptInput {
                        raw_transcript: raw_transcript.clone(),
                        pending_selected_text,
                        settings: &settings,
                        active_mode: active_mode.as_ref(),
                        auto_paste,
                        log_context: None,
                        cancel_token: Some(&cancel_token),
                        keep_pill_expanded: false,
                        audio_duration_seconds,
                    },
                )
                .await
                {
                    ProcessTranscriptOutcome::Ready(processed) => processed,
                    ProcessTranscriptOutcome::Empty => {
                        handle_empty_transcription(
                            &app_handle,
                            &saved_for_task.path,
                            saved_for_task.pending_path.as_deref(),
                        );
                        return;
                    }
                    ProcessTranscriptOutcome::Cancelled => {
                        settle_cancelled_recording(
                            &app_handle,
                            saved_for_task.pending_path.as_deref(),
                            false,
                        );
                        return;
                    }
                };

                if is_cancelled() {
                    settle_cancelled_recording(
                        &app_handle,
                        saved_for_task.pending_path.as_deref(),
                        false,
                    );
                    return;
                }

                let metadata = build_transcription_metadata(TranscriptionMetadataInput {
                    saved: &saved_for_task,
                    settings: &settings,
                    final_text: &processed.final_transcript,
                    llm_cleaned: processed.llm_cleaned,
                    synced: false,
                    mode: active_mode.as_ref(),
                    workflow: active_workflow.as_ref(),
                    speech_model: result.speech_model,
                    app_id: active_app_id.as_deref(),
                });

                commit_transcription(
                    &app_handle,
                    CompletionInput {
                        raw_transcript,
                        final_transcript: processed.final_transcript,
                        auto_paste: processed.pasted,
                        audio_path: saved_for_task.path.display().to_string(),
                        pending_path: saved_for_task.pending_path.clone(),
                        llm_cleaned: processed.llm_cleaned,
                        metadata,
                        mode: transcription_mode_label(&settings),
                        transcription_duration_seconds: transcription_started_at
                            .elapsed()
                            .as_secs_f32(),
                        audio_source: "microphone",
                        temporary,
                        timestamp_override: None,
                    },
                );

                app_handle
                    .state::<AppState>()
                    .pill()
                    .finish_processing(&app_handle);
                app_handle.state::<AppState>().set_pending_path(None);
            }
            Err(err) => {
                if is_cancelled() {
                    discard_pending_recording(saved_for_task.pending_path.as_deref());
                    app_handle.state::<AppState>().set_pending_path(None);
                    return;
                }
                let show_toast = !is_remote_fallback_unavailable(&err);
                emit_transcription_error_inner(
                    &app_handle,
                    format!("Transcription failed: {err}"),
                    "transcription",
                    audio_duration_seconds,
                    "microphone",
                    saved_for_task.path.display().to_string(),
                    saved_for_task.pending_path.as_deref(),
                    true,
                    temporary,
                    show_toast,
                );
                app_handle.state::<AppState>().set_pending_path(None);
            }
        }
    });
}

async fn transcribe_completed_recording_locally(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
    recording: CompletedRecording,
    cancel_token: Option<CancellationToken>,
    prefer_any_installed: bool,
    screen_terms: Vec<String>,
) -> Result<transcription_api::TranscriptionSuccess> {
    let ready_model = if prefer_any_installed {
        model_manager::ensure_local_fallback_model(app, &settings.local_model)?
    } else {
        model_manager::ensure_model_ready(app, &settings.local_model)?
    };
    let mut dictionary_terms = dictionary::dictionary_entries_for_model(&ready_model, settings);
    // Screen-as-dictionary: the ephemeral on-screen terms ride along only
    // when the model takes a dictionary at all - same capability gate as the
    // user's own entries - and are appended after them so an engine-side
    // prompt budget truncates the ephemeral tail first.
    if !screen_terms.is_empty()
        && model_supports_capability(&ready_model.key, MODEL_CAPABILITY_DICTIONARY)
    {
        dictionary_terms = screen_vocabulary::merge_screen_terms(dictionary_terms, &screen_terms);
    }
    let language = settings.language.clone();
    let transcriber = app.state::<AppState>().local_transcriber();

    match async_runtime::spawn_blocking(move || {
        // The model declares how it wants long audio fed to it.
        let policy = speech::engine::chunk_policy(ready_model.engine);
        let (chunk_seconds, overlap_seconds, strip_hallucinated_thank_you) =
            (policy.chunk_seconds, policy.overlap_seconds, false);
        transcribe_local_chunked(
            &transcriber,
            &ready_model,
            &recording.samples,
            recording.sample_rate,
            LocalChunkingConfig {
                dictionary: &dictionary_terms,
                language: Some(&language),
                chunk_seconds: chunk_seconds as f32,
                overlap_seconds: overlap_seconds as f32,
                cancel_token: cancel_token.as_ref(),
                strip_hallucinated_thank_you,
            },
        )
    })
    .await
    {
        Ok(inner) => inner,
        Err(err) => Err(anyhow!("Local transcription task failed: {err}")),
    }
}

pub(crate) fn recover_interrupted_recordings(app: &AppHandle<AppRuntime>) {
    let base_dir = match crate::recordings_root(app) {
        Ok(path) => path,
        Err(_) => return,
    };
    let app = app.clone();

    async_runtime::spawn(async move {
        let scan_dir = base_dir.clone();
        let recovered = match async_runtime::spawn_blocking(move || {
            crate::recorder::recover_pending_recordings(scan_dir)
        })
        .await
        {
            Ok(list) => list,
            Err(err) => {
                tracing::error!("Recovery scan failed: {err}");
                return;
            }
        };

        if recovered.is_empty() {
            return;
        }

        Notice::new("info", "Recovering your last recording...")
            .dismiss_after(30_000)
            .emit(&app);

        let settings = app.state::<AppState>().current_settings();
        let mut saved_count = 0usize;
        for (saved, recording) in recovered {
            match transcribe_recovered_recording(&app, &saved, recording, &settings).await {
                Ok(RecoveredTranscriptionOutcome::Saved) => {
                    saved_count += 1;
                }
                Ok(RecoveredTranscriptionOutcome::Empty) => {}
                Err(err) => tracing::error!("Failed to transcribe recovered recording: {err}"),
            }
        }

        if saved_count == 0 {
            return;
        }

        let (title, message) = if saved_count == 1 {
            ("Recording recovered", "Saved to History.".to_owned())
        } else {
            (
                "Recordings recovered",
                format!("{saved_count} recordings saved to History."),
            )
        };
        Notice::new("success", message)
            .title(title)
            .persistent()
            .primary_action("view_recovered_transcriptions", "View History")
            .secondary_action("copy_last_transcription", "Copy")
            .emit(&app);
    });
}

enum RecoveredTranscriptionOutcome {
    Saved,
    Empty,
}

async fn transcribe_recovered_recording(
    app: &AppHandle<AppRuntime>,
    saved: &RecordingSaved,
    recording: CompletedRecording,
    settings: &UserSettings,
) -> Result<RecoveredTranscriptionOutcome> {
    let transcription_started_at = Instant::now();
    let audio_duration_seconds = RecordingDuration(saved).seconds();
    let http = app.state::<AppState>().http();
    let active_mode = mode_context::resolve_active_personality(settings);
    let model_id = speech::selected_model(settings);
    let use_remote = remote_speech::is_remote_model(&model_id);

    let result = match speech::transcribe(
        app,
        &http,
        settings,
        &model_id,
        &saved.path,
        &settings.local_model,
        false,
        || false,
        |success| success,
        move || {
            transcribe_completed_recording_locally(
                app,
                settings,
                recording,
                None,
                use_remote,
                Vec::new(),
            )
        },
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            emit_transcription_error_inner(
                app,
                format!("Transcription failed: {err}"),
                "transcription",
                audio_duration_seconds,
                "microphone",
                saved.path.display().to_string(),
                saved.pending_path.as_deref(),
                false,
                false,
                true,
            );
            return Err(err);
        }
    };

    let raw_transcript = result.transcript.clone();
    if count_words(&raw_transcript) == 0 {
        handle_empty_transcription(app, &saved.path, saved.pending_path.as_deref());
        return Ok(RecoveredTranscriptionOutcome::Empty);
    }

    let processed = match process_transcript_text(
        app,
        &http,
        ProcessTranscriptInput {
            raw_transcript: raw_transcript.clone(),
            pending_selected_text: None,
            settings,
            active_mode: active_mode.as_ref(),
            auto_paste: false,
            log_context: Some("recovery"),
            cancel_token: None,
            keep_pill_expanded: false,
            audio_duration_seconds,
        },
    )
    .await
    {
        ProcessTranscriptOutcome::Ready(processed) => processed,
        ProcessTranscriptOutcome::Empty => {
            handle_empty_transcription(app, &saved.path, saved.pending_path.as_deref());
            return Ok(RecoveredTranscriptionOutcome::Empty);
        }
        ProcessTranscriptOutcome::Cancelled => return Err(anyhow!("Transcription cancelled")),
    };

    let metadata = build_transcription_metadata(TranscriptionMetadataInput {
        saved,
        settings,
        final_text: &processed.final_transcript,
        llm_cleaned: processed.llm_cleaned,
        synced: false,
        mode: active_mode.as_ref(),
        workflow: None,
        speech_model: result.speech_model,
        app_id: None,
    });

    let persisted = commit_transcription(
        app,
        CompletionInput {
            raw_transcript,
            final_transcript: processed.final_transcript,
            auto_paste: false,
            audio_path: saved.path.display().to_string(),
            pending_path: saved.pending_path.clone(),
            llm_cleaned: processed.llm_cleaned,
            metadata,
            mode: transcription_mode_label(settings),
            transcription_duration_seconds: transcription_started_at.elapsed().as_secs_f32(),
            audio_source: "microphone",
            temporary: false,
            timestamp_override: Some(saved.started_at),
        },
    );

    if !persisted {
        return Err(anyhow!("Failed to persist recovered transcription"));
    }

    Ok(RecoveredTranscriptionOutcome::Saved)
}

async fn transcribe_saved_recording_locally(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
    saved: &RecordingSaved,
    cancel_token: Option<CancellationToken>,
    prefer_any_installed: bool,
) -> Result<transcription_api::TranscriptionSuccess> {
    let (samples, sample_rate) = load_audio_for_transcription(&saved.path)?;
    transcribe_completed_recording_locally(
        app,
        settings,
        CompletedRecording {
            samples,
            sample_rate,
            channels: 1,
            started_at: saved.started_at,
            ended_at: saved.ended_at,
            pending_path: None,
            speech_percentage: None,
        },
        cancel_token,
        prefer_any_installed,
        // Retries/recovery replay old audio; the screen moved on, so no
        // ephemeral screen terms here.
        Vec::new(),
    )
    .await
}

struct TranscriptPlan {
    mode_rule: Option<ModeRule>,
    selected_text: Option<String>,
    edit_mode: bool,
    formatted_text: String,
    focused_format: Option<crate::field_format::FieldFormat>,
    instruction: String,
    action: EditAction,
    preset: Option<TransformPreset>,
}

impl TranscriptPlan {
    async fn prepare(
        app: &AppHandle<AppRuntime>,
        raw_text: &str,
        selected_text: Option<String>,
        settings: &UserSettings,
        active_mode: Option<&Personality>,
        auto_paste: bool,
        cancel_token: Option<&CancellationToken>,
    ) -> Option<Self> {
        let mode_rule = mode_context::resolve_active_mode_rule(settings);
        let selected_text = match mode_rule.as_ref().map(|rule| rule.input) {
            Some(WorkflowInput::Clipboard) => assistive::read_text_from_clipboard(20_000),
            _ => selected_text,
        };
        let edit_mode = selected_text.is_some();
        let language = mode_rule
            .as_ref()
            .and_then(|rule| rule.language.as_deref())
            .unwrap_or(&settings.language);
        let formatted_text = match edit_mode {
            true => raw_text.to_owned(),
            false => crate::spoken_formatting::apply_spoken_formatting(raw_text, language),
        };
        let focused_format = (!edit_mode && auto_paste && active_mode.is_none())
            .then(crate::field_format::detect)
            .flatten();

        let spoken_preset = edit_mode
            .then(|| selection_actions::parse_preset_command(raw_text))
            .flatten();
        let (voice_preset, mut instruction) = spoken_preset
            .map(|(preset, instruction)| (Some(preset), instruction))
            .unwrap_or_else(|| (None, formatted_text.clone()));
        if let Some(prompt) = mode_rule
            .as_ref()
            .and_then(|rule| rule.custom_prompt.as_deref())
        {
            instruction = prompt.to_owned();
        } else if !edit_mode
            && mode_rule
                .as_ref()
                .is_some_and(|rule| rule.transform_preset.is_some())
        {
            instruction.clear();
        }

        let workflow_action = mode_rule.as_ref().map(|rule| match rule.output {
            WorkflowOutput::Insert => EditAction::Insert,
            WorkflowOutput::Replace => EditAction::Replace,
            WorkflowOutput::Copy => EditAction::Copy,
        });
        let configured_preset = mode_rule.as_ref().and_then(|rule| rule.transform_preset);
        let (action, preset) = if edit_mode && settings.active_workflow_id.is_none() {
            let state = app.state::<AppState>();
            state.set_pending_voice_preset(voice_preset);
            let decision = await_edit_action_selection(app, &instruction, cancel_token).await;
            state.set_pending_voice_preset(None);
            match decision {
                EditActionDecision::Cancel => return None,
                EditActionDecision::Chosen { action, preset } => (action, preset.or(voice_preset)),
            }
        } else {
            (workflow_action.unwrap_or_default(), configured_preset)
        };
        if edit_mode {
            tracing::debug!(
                action = action.label(),
                preset = preset.map(TransformPreset::label),
                "Selection Mode action selected"
            );
        }
        Some(Self {
            mode_rule,
            selected_text,
            edit_mode,
            formatted_text,
            focused_format,
            instruction,
            action,
            preset,
        })
    }
}

struct RefinedText {
    text: String,
    cleaned: bool,
    used_screen_context: bool,
}

enum RefinementIntent {
    Deterministic { warn_unavailable: bool },
    EditSelection,
    TransformWorkflow,
    CleanDictation,
}

struct RefinementRequest<'a> {
    app: &'a AppHandle<AppRuntime>,
    http: &'a reqwest::Client,
    settings: &'a UserSettings,
    active_mode: Option<&'a Personality>,
    mode_rule: Option<&'a ModeRule>,
    selected_text: Option<&'a str>,
    formatted_text: &'a str,
    instruction: &'a str,
    preset: Option<TransformPreset>,
    focused_format: Option<crate::field_format::FieldFormat>,
    keep_pill_expanded: bool,
    log_context: Option<&'a str>,
}

impl RefinementRequest<'_> {
    fn intent(&self) -> RefinementIntent {
        let edit_mode = self.selected_text.is_some();
        let workflow_transform = self.mode_rule.is_some_and(|rule| {
            !rule.deterministic_only
                && (rule.transform_preset.is_some() || rule.custom_prompt.is_some())
        });
        let automatic_cleanup =
            llm_cleanup::should_refine_transcript(self.settings, self.active_mode);
        let needs_model = edit_mode || workflow_transform || automatic_cleanup;
        let preflight_failed =
            needs_model && matches!(llm_cleanup::cached_preflight_available(), Some(false));
        let configured = llm_cleanup::is_llm_available(self.settings);
        let enabled = if edit_mode || workflow_transform {
            configured && !preflight_failed
        } else {
            automatic_cleanup && !preflight_failed
        };
        if !enabled {
            return RefinementIntent::Deterministic {
                warn_unavailable: preflight_failed,
            };
        }
        if edit_mode {
            RefinementIntent::EditSelection
        } else if workflow_transform {
            RefinementIntent::TransformWorkflow
        } else {
            RefinementIntent::CleanDictation
        }
    }

    async fn execute(self) -> RefinedText {
        let intent = self.intent();
        if let RefinementIntent::Deterministic { warn_unavailable } = intent {
            if warn_unavailable {
                maybe_warn_llm_unavailable(self.app, self.selected_text.is_some());
            }
            return self.deterministic();
        }

        self.show_progress();
        let result = match intent {
            RefinementIntent::EditSelection => self.edit_selection().await,
            RefinementIntent::TransformWorkflow => self.transform_workflow().await,
            RefinementIntent::CleanDictation => self.clean_dictation().await,
            RefinementIntent::Deterministic { .. } => unreachable!(),
        };
        crate::pill::emit_pill_mode_with_tone(self.app, false, "", crate::pill::PILL_TONE_DEFAULT);
        result
    }

    fn deterministic(&self) -> RefinedText {
        RefinedText {
            text: self.formatted_text.to_owned(),
            cleaned: false,
            used_screen_context: false,
        }
    }

    fn show_progress(&self) {
        let (expanded, text) = if self.keep_pill_expanded {
            (true, self.instruction)
        } else {
            (false, "")
        };
        crate::pill::emit_pill_mode_with_tone(
            self.app,
            expanded,
            text,
            crate::pill::PILL_TONE_CLEANUP,
        );
    }

    async fn edit_selection(&self) -> RefinedText {
        let selected = self
            .selected_text
            .expect("selection intent requires selected text");
        let screen_context = if self.settings.use_screen_context {
            async_runtime::spawn_blocking(accessibility_context::capture_screen_context)
                .await
                .ok()
                .flatten()
        } else {
            None
        };
        let app_for_stream = self.app.clone();
        let mut last_emit: Option<Instant> = None;
        let mut publish_partial = move |text: &str| {
            const INTERVAL: Duration = Duration::from_millis(40);
            if last_emit.is_none_or(|at| at.elapsed() >= INTERVAL) {
                crate::pill::emit_pill_transform_stream(&app_for_stream, text);
                last_emit = Some(Instant::now());
            }
        };
        match llm_cleanup::edit_transcription(
            self.app,
            self.http,
            selected,
            self.instruction,
            self.settings,
            self.preset,
            screen_context.as_deref(),
            Some(&mut publish_partial),
        )
        .await
        {
            Ok(text) => RefinedText {
                text,
                cleaned: true,
                used_screen_context: screen_context.is_some(),
            },
            Err(error) => {
                let issue = llm_cleanup::llm_issue_message(&error);
                self.note_failure("LLM edit", &issue, true);
                RefinedText {
                    text: selected.to_owned(),
                    cleaned: false,
                    used_screen_context: false,
                }
            }
        }
    }

    async fn transform_workflow(&self) -> RefinedText {
        match llm_cleanup::edit_transcription(
            self.app,
            self.http,
            self.formatted_text,
            self.instruction,
            self.settings,
            self.preset,
            None,
            None,
        )
        .await
        {
            Ok(text) => RefinedText {
                text,
                cleaned: true,
                used_screen_context: false,
            },
            Err(error) => {
                let issue = llm_cleanup::llm_issue_message(&error);
                self.note_failure("Workflow transform", &issue, false);
                self.deterministic()
            }
        }
    }

    async fn clean_dictation(&self) -> RefinedText {
        match llm_cleanup::cleanup_transcription(
            self.app,
            self.http,
            self.formatted_text,
            self.settings,
            self.active_mode,
            self.focused_format,
        )
        .await
        {
            Ok(text) => RefinedText {
                text,
                cleaned: true,
                used_screen_context: false,
            },
            Err(error) => {
                let issue = llm_cleanup::llm_issue_message(&error);
                self.note_failure("Cleanup", &issue, false);
                self.deterministic()
            }
        }
    }

    fn note_failure(&self, operation: &str, issue: &str, edit_mode: bool) {
        match self.log_context {
            Some(context) => tracing::error!("{operation} failed ({context}): {issue}"),
            None if edit_mode => {
                tracing::error!("LLM edit failed, keeping original selected text: {issue}")
            }
            None if operation == "Workflow transform" => {
                tracing::error!("Workflow transform failed, using deterministic text: {issue}")
            }
            None => tracing::error!("Cleanup failed, using raw transcript: {issue}"),
        }
        llm_cleanup::note_preflight_failure();
        maybe_warn_llm_unavailable(self.app, edit_mode);
    }
}

async fn process_transcript_text(
    app: &AppHandle<AppRuntime>,
    http: &reqwest::Client,
    input: ProcessTranscriptInput<'_>,
) -> ProcessTranscriptOutcome {
    let ProcessTranscriptInput {
        raw_transcript,
        pending_selected_text,
        settings,
        active_mode,
        auto_paste,
        log_context,
        cancel_token,
        keep_pill_expanded,
        audio_duration_seconds,
    } = input;

    let Some(plan) = TranscriptPlan::prepare(
        app,
        &raw_transcript,
        pending_selected_text,
        settings,
        active_mode,
        auto_paste,
        cancel_token,
    )
    .await
    else {
        return ProcessTranscriptOutcome::Cancelled;
    };
    let TranscriptPlan {
        mode_rule: active_mode_rule,
        selected_text: pending_selected_text,
        edit_mode: is_edit_mode,
        formatted_text: formatted_transcript,
        focused_format: focused_field_format,
        instruction: edit_instruction,
        action: edit_action,
        preset: transform_preset,
    } = plan;

    let refined = RefinementRequest {
        app,
        http,
        settings,
        active_mode,
        mode_rule: active_mode_rule.as_ref(),
        selected_text: pending_selected_text.as_deref(),
        formatted_text: &formatted_transcript,
        instruction: &edit_instruction,
        preset: transform_preset,
        focused_format: focused_field_format,
        keep_pill_expanded,
        log_context,
    }
    .execute()
    .await;
    let used_screen_context = refined.used_screen_context;
    let llm_cleaned = refined.cleaned;
    let final_transcript = refined.text;

    let mut final_transcript =
        dictionary::apply_replacements(&final_transcript, &settings.replacements);
    // Snippets run after replacements so triggers match the corrected text.
    let snippet_context = user_snippets::UserSnippetContext::capture(
        &settings.user_snippets,
        &final_transcript,
        pending_selected_text.as_deref(),
    );
    final_transcript = user_snippets::apply_user_snippets_with_context(
        &final_transcript,
        &settings.user_snippets,
        &snippet_context,
    );
    if count_words(&final_transcript) == 0 {
        return ProcessTranscriptOutcome::Empty;
    }

    let token_cancelled = cancel_token.map(|t| t.is_cancelled()).unwrap_or(false);
    if token_cancelled || app.state::<AppState>().is_cancelled() {
        return ProcessTranscriptOutcome::Cancelled;
    }

    // Selection Mode's non-inserting actions (F2). `insertion_is_reachable`
    // is the single predicate gating every call site below that can reach
    // `assistive::insert_text`/`insert_after_selection` - `Ask` and `Copy`
    // return here, before either gate, so neither can ever insert (see the
    // `ask_and_copy_never_reach_the_insertion_gate` test near the bottom of
    // this file, which exercises this exact predicate).
    let workflow_copy = active_mode_rule
        .as_ref()
        .is_some_and(|rule| matches!(&rule.output, WorkflowOutput::Copy));
    if workflow_copy && !is_edit_mode {
        match assistive::copy_text_to_clipboard(&final_transcript) {
            Ok(()) => emit_insertion_toast(app, "success", "Workflow output copied to clipboard"),
            Err(err) => emit_auto_paste_error(
                app,
                format!("Copy to clipboard failed: {err}"),
                audio_duration_seconds,
            ),
        }
        return ProcessTranscriptOutcome::Ready(ProcessedTranscript {
            final_transcript,
            llm_cleaned,
            pasted: false,
        });
    }
    if !insertion_is_reachable(is_edit_mode, edit_action) {
        match edit_action {
            EditAction::Ask => {
                await_ask_result_dismissal(
                    app,
                    &final_transcript,
                    used_screen_context,
                    cancel_token,
                )
                .await;
            }
            EditAction::Copy => match assistive::copy_text_to_clipboard(&final_transcript) {
                Ok(()) => emit_insertion_toast(app, "success", "Copied to clipboard"),
                Err(err) => emit_auto_paste_error(
                    app,
                    format!("Copy to clipboard failed: {err}"),
                    audio_duration_seconds,
                ),
            },
            EditAction::Replace | EditAction::Insert => {
                unreachable!("permits_insertion() is false only for Ask/Copy")
            }
        }
        return ProcessTranscriptOutcome::Ready(ProcessedTranscript {
            final_transcript,
            llm_cleaned,
            pasted: false,
        });
    }

    let preview_enabled = if is_edit_mode {
        settings.preview_before_insert_selection_enabled
    } else {
        settings.preview_before_insert_enabled
    };

    if auto_paste && preview_enabled && !final_transcript.trim().is_empty() {
        let state = app.state::<AppState>();
        let receiver = state.begin_pending_insertion();
        crate::pill::emit_pill_mode_full(
            app,
            true,
            &final_transcript,
            crate::pill::PILL_TONE_PREVIEW,
            used_screen_context,
        );

        let decision = match cancel_token {
            Some(token) => tokio::select! {
                result = receiver => result.unwrap_or(InsertionDecision::Cancel),
                _ = token.cancelled() => InsertionDecision::Cancel,
            },
            None => receiver.await.unwrap_or(InsertionDecision::Cancel),
        };

        state.clear_pending_insertion();
        crate::pill::emit_pill_mode_with_tone(app, false, "", crate::pill::PILL_TONE_DEFAULT);

        match decision {
            InsertionDecision::Cancel => return ProcessTranscriptOutcome::Cancelled,
            InsertionDecision::Confirm(edited) => {
                final_transcript = edited;
            }
        }
    }

    let mut pasted = false;
    if auto_paste && !final_transcript.trim().is_empty() {
        // `platform_supports_ax` gates whether we can read the focused
        // element at all (macOS/Windows only) - it does NOT depend on edit
        // mode, so Selection Mode's Replace still gets AX-direct + verified
        // insertion via `pre_paste_snapshot` below (F2 fix: this used to be
        // bundled with `can_read_field` below, silently degrading every
        // Selection Mode replace to unverified clipboard+paste).
        let platform_supports_ax = cfg!(any(target_os = "macos", target_os = "windows"));
        // `can_read_field` now covers ONLY the edit-mode-specific behaviors
        // that legitimately don't apply to a selection replace: matching the
        // capitalization of surrounding dictated text, and auto-dictionary
        // learning from a continuous typing flow.
        let can_read_field = !is_edit_mode && platform_supports_ax;
        let selected_model = speech::selected_model(settings);
        let selected_model_supports_dictionary = remote_speech::is_remote_model(&selected_model)
            || model_supports_capability(&selected_model, MODEL_CAPABILITY_DICTIONARY);
        let should_watch_auto_dictionary = can_read_field
            && settings.auto_dictionary_enabled
            && selected_model_supports_dictionary;
        // Smart Modes' (F5) auto-send: only for Selection Mode's inserting
        // actions (Replace/Insert) - `Ask`/`Copy` never reach this block at
        // all (see `insertion_is_reachable` above this function).
        let should_auto_send = active_mode_rule
            .as_ref()
            .is_some_and(|rule| rule.auto_send_on_insert);
        let transcript_to_paste = final_transcript.clone();
        let token_for_paste = cancel_token.cloned();
        let app_for_paste = app.clone();
        let paste_result = async_runtime::spawn_blocking(move || {
            let cancelled = token_for_paste
                .as_ref()
                .map(|token| token.is_cancelled())
                .unwrap_or(false)
                || app_for_paste.state::<AppState>().is_cancelled();
            if cancelled {
                return None;
            }
            let pre_paste_snapshot = platform_supports_ax
                .then(assistive::focused_text_snapshot)
                .flatten();
            let text = can_read_field
                .then_some(())
                .and(pre_paste_snapshot.as_ref())
                .map(|snapshot| {
                    match_insertion_capitalization(&transcript_to_paste, &snapshot.value)
                })
                .unwrap_or(transcript_to_paste);
            // Selection Mode's "Insert" action (F2) leaves the original
            // selection in place instead of overwriting it - there is no
            // AX-direct equivalent for that, see `insert_after_selection`.
            let result = if edit_action == EditAction::Insert {
                assistive::insert_after_selection(&text)
            } else {
                assistive::insert_text(&text, pre_paste_snapshot.as_ref())
            };
            if should_auto_send && result.is_ok() {
                // Let the paste settle before submitting - mirrors the
                // short delays already used around synthetic keystrokes
                // elsewhere in this file (see `insert_after_selection`).
                std::thread::sleep(std::time::Duration::from_millis(30));
                if let Err(err) = assistive::send_return_key() {
                    tracing::warn!("Smart Mode auto-send failed: {err}");
                }
            }
            Some((result, pre_paste_snapshot, text))
        })
        .await;
        match paste_result {
            Ok(None) => return ProcessTranscriptOutcome::Cancelled,
            Ok(Some((Ok((outcome, undo_state)), pre_paste_snapshot, pasted_text))) => {
                tracing::debug!(
                    method = ?outcome.method,
                    verified = outcome.verified,
                    confirmed_failure = outcome.confirmed_failure,
                    "auto-insertion completed"
                );
                app.state::<AppState>().set_last_insertion(undo_state);
                if let Err(err) = app.emit(
                    crate::pill::EVENT_PILL_INSERTED,
                    crate::pill::PillInsertedPayload {
                        chars: pasted_text.chars().count(),
                        can_undo: outcome.verified,
                    },
                ) {
                    tracing::error!("Failed to emit pill inserted: {err}");
                }
                if outcome.verified {
                    pasted = true;
                    // Corrections learning (F5.2): only a VERIFIED insertion
                    // is worth re-reading later - anything weaker and we
                    // can't tell user corrections from our own failure.
                    if let Some(snapshot) = pre_paste_snapshot.clone() {
                        corrections::schedule_recheck_after_verified_insert(
                            app.clone(),
                            snapshot,
                            pasted_text.clone(),
                        );
                    }
                } else if outcome.confirmed_failure {
                    // We positively confirmed the text did *not* land as
                    // expected - real evidence something went wrong, but the
                    // OS-level call itself still reported success (and may
                    // well have inserted something), so this is a soft
                    // warning with an Undo escape hatch rather than the
                    // harder "auto paste failed" error path.
                    tracing::warn!("auto-insertion could not be confirmed");
                }
                if outcome.verified {
                    await_inserted_result_dismissal(app, &final_transcript, cancel_token).await;
                } else if should_show_copy_result_after_insertion(&outcome) {
                    await_copy_result_dismissal(app, &final_transcript, cancel_token).await;
                }
                if let (true, Some(pre_paste_snapshot)) =
                    (should_watch_auto_dictionary, pre_paste_snapshot)
                {
                    auto_dictionary::start_after_paste(
                        app.clone(),
                        pre_paste_snapshot,
                        pasted_text,
                        settings.dictionary.clone(),
                        settings.auto_dictionary_ignored.clone(),
                    );
                }
            }
            Ok(Some((Err(err), _, _))) => {
                emit_auto_paste_error(
                    app,
                    format!("Auto paste failed: {err}"),
                    audio_duration_seconds,
                );
                await_copy_result_dismissal(app, &final_transcript, cancel_token).await;
            }
            Err(err) => {
                emit_auto_paste_error(
                    app,
                    format!("Auto paste task error: {err}"),
                    audio_duration_seconds,
                );
                await_copy_result_dismissal(app, &final_transcript, cancel_token).await;
            }
        }
    }

    ProcessTranscriptOutcome::Ready(ProcessedTranscript {
        final_transcript,
        llm_cleaned,
        pasted,
    })
}

/// Whether `process_transcript_text` may reach the auto-paste block at all
/// (its only call sites for `assistive::insert_text` /
/// `insert_after_selection`) for this `(is_edit_mode, action)` pair. Plain
/// dictation (`is_edit_mode == false`) has no action to gate on and always
/// permits insertion; in Selection Mode this is exactly
/// `EditAction::permits_insertion()`. This is the literal predicate used at
/// the real call site above, not a re-implementation of it - see the test
/// module at the bottom of this file for the "Ask/Copy never insert"
/// guarantee this gives.
fn insertion_is_reachable(is_edit_mode: bool, action: EditAction) -> bool {
    !is_edit_mode || action.permits_insertion()
}

fn should_show_copy_result_after_insertion(outcome: &assistive::InsertOutcome) -> bool {
    !outcome.verified
}

/// Blocks on Selection Mode's action selector (F2): shows the pill,
/// expanded, with the transcribed voice instruction and tone
/// `PILL_TONE_ACTION_SELECT`, and waits for the user to resolve
/// `AppState::begin_pending_edit_action` - via the `choose_edit_action` /
/// `cancel_edit_action` commands - or for cancellation.
async fn await_edit_action_selection(
    app: &AppHandle<AppRuntime>,
    instruction_text: &str,
    cancel_token: Option<&CancellationToken>,
) -> EditActionDecision {
    let state = app.state::<AppState>();
    let receiver = state.begin_pending_edit_action();
    crate::pill::emit_pill_mode_with_tone(
        app,
        true,
        instruction_text,
        crate::pill::PILL_TONE_ACTION_SELECT,
    );

    let decision = match cancel_token {
        Some(token) => tokio::select! {
            result = receiver => result.unwrap_or(EditActionDecision::Cancel),
            _ = token.cancelled() => EditActionDecision::Cancel,
        },
        None => receiver.await.unwrap_or(EditActionDecision::Cancel),
    };

    state.clear_pending_edit_action();
    decision
}

/// Shows Selection Mode's "Ask" result in the pill (tone
/// `PILL_TONE_ASK_RESULT`) and waits for the user to dismiss it. Reuses the
/// same `pending_insertion` gate as the preview-before-insert flow purely as
/// a wait/dismiss signal - the resolved `InsertionDecision` is deliberately
/// never inspected, and nothing in this function can reach
/// `assistive::insert_text`.
async fn await_ask_result_dismissal(
    app: &AppHandle<AppRuntime>,
    text: &str,
    used_screen_context: bool,
    cancel_token: Option<&CancellationToken>,
) {
    ResultDismissal {
        text,
        presentation: ResultPresentation::Full {
            tone: crate::pill::PILL_TONE_ASK_RESULT,
            used_screen_context,
        },
        cancellation: cancel_token,
    }
    .wait(app)
    .await;
}

async fn await_copy_result_dismissal(
    app: &AppHandle<AppRuntime>,
    text: &str,
    cancel_token: Option<&CancellationToken>,
) {
    ResultDismissal::toned(text, crate::pill::PILL_TONE_COPY_RESULT, cancel_token)
        .wait(app)
        .await;
}

async fn await_inserted_result_dismissal(
    app: &AppHandle<AppRuntime>,
    text: &str,
    cancel_token: Option<&CancellationToken>,
) {
    ResultDismissal::toned(text, crate::pill::PILL_TONE_INSERTED_RESULT, cancel_token)
        .wait(app)
        .await;
}

enum ResultPresentation<'a> {
    Tone(&'a str),
    Full {
        tone: &'a str,
        used_screen_context: bool,
    },
}

struct ResultDismissal<'a> {
    text: &'a str,
    presentation: ResultPresentation<'a>,
    cancellation: Option<&'a CancellationToken>,
}

impl<'a> ResultDismissal<'a> {
    fn toned(text: &'a str, tone: &'a str, cancellation: Option<&'a CancellationToken>) -> Self {
        Self {
            text,
            presentation: ResultPresentation::Tone(tone),
            cancellation,
        }
    }

    async fn wait(self, app: &AppHandle<AppRuntime>) {
        let state = app.state::<AppState>();
        let dismissal = state.begin_pending_insertion();
        match self.presentation {
            ResultPresentation::Tone(tone) => {
                crate::pill::emit_pill_mode_with_tone(app, true, self.text, tone)
            }
            ResultPresentation::Full {
                tone,
                used_screen_context,
            } => crate::pill::emit_pill_mode_full(app, true, self.text, tone, used_screen_context),
        }
        if let Some(token) = self.cancellation {
            tokio::select! {
                _ = dismissal => {},
                _ = token.cancelled() => {},
            }
        } else {
            let _ignored = dismissal.await;
        }
        state.clear_pending_insertion();
        crate::pill::emit_pill_mode_with_tone(app, false, "", crate::pill::PILL_TONE_DEFAULT);
    }
}

#[cfg(debug_assertions)]
pub(crate) fn show_last_result_for_qa(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let text = state
        .storage()
        .get_recent_transcriptions(1)
        .map_err(|error| format!("Failed to load the last transcription: {error}"))?
        .into_iter()
        .next()
        .map(|record| record.text)
        .ok_or_else(|| "No successful quick-note transcription is available".to_string())?;

    show_result_for_qa(app, text)
}

#[cfg(debug_assertions)]
pub(crate) fn show_result_for_qa(app: &AppHandle<AppRuntime>, text: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .pill()
        .transition_to(app, crate::pill::PillStatus::Processing);
    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Starting from idle makes the overlay webview visible; give its
        // event listeners one frame to resume before sending the result.
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        await_copy_result_dismissal(&task_app, &text, None).await;
        task_app.state::<AppState>().pill().reset(&task_app);
    });
    Ok(())
}

pub(crate) fn retry_transcription_async(
    app: &AppHandle<AppRuntime>,
    saved: RecordingSaved,
    settings: UserSettings,
    original_id: String,
    saved_mode: (Option<String>, Option<String>),
    cancel_token: CancellationToken,
) {
    let (saved_mode_id, saved_mode_name) = saved_mode;
    let saved_app_id = app
        .state::<AppState>()
        .storage()
        .get_by_id(&original_id)
        .and_then(|record| record.app_id);
    let saved_personality = saved_mode_id.as_ref().and_then(|id| {
        settings
            .personalities
            .iter()
            .find(|personality| personality.id == *id && personality.enabled)
            .cloned()
    });
    let task = RetryTranscription {
        app: app.clone(),
        saved,
        settings,
        id: original_id,
        mode_id: saved_mode_id,
        mode_name: saved_mode_name,
        app_id: saved_app_id,
        personality: saved_personality,
        cancellation: cancel_token,
    };
    async_runtime::spawn(task.run());
}

struct RetryTranscription {
    app: AppHandle<AppRuntime>,
    saved: RecordingSaved,
    settings: UserSettings,
    id: String,
    mode_id: Option<String>,
    mode_name: Option<String>,
    app_id: Option<String>,
    personality: Option<Personality>,
    cancellation: CancellationToken,
}

struct RetryRegistration {
    app: AppHandle<AppRuntime>,
    id: String,
}

impl Drop for RetryRegistration {
    fn drop(&mut self) {
        self.app
            .state::<AppState>()
            .clear_retry_transcription(&self.id);
    }
}

impl RetryTranscription {
    async fn run(self) {
        let started = Instant::now();
        let _registration = RetryRegistration {
            app: self.app.clone(),
            id: self.id.clone(),
        };
        if self.cancelled() {
            return;
        }
        tracing::info!(
            "[retry_transcription] mode={:?}",
            self.settings.transcription_mode,
        );
        let result = self.transcribe_audio().await;
        match result {
            Ok(success) if !self.cancelled() => self.finish_success(success, started).await,
            Ok(_) => {}
            Err(error) if !self.cancelled() => self.finish_failure(error),
            Err(_) => {}
        }
    }

    fn cancelled(&self) -> bool {
        self.cancellation.is_cancelled()
    }

    async fn transcribe_audio(&self) -> Result<transcription_api::TranscriptionSuccess> {
        let http = self.app.state::<AppState>().http();
        let model = speech::selected_model(&self.settings);
        let remote = remote_speech::is_remote_model(&model);
        speech::transcribe(
            &self.app,
            &http,
            &self.settings,
            &model,
            &self.saved.path,
            &self.settings.local_model,
            false,
            || self.cancelled(),
            std::convert::identity,
            || {
                transcribe_saved_recording_locally(
                    &self.app,
                    &self.settings,
                    &self.saved,
                    Some(self.cancellation.clone()),
                    remote,
                )
            },
        )
        .await
    }

    async fn finish_success(
        &self,
        success: transcription_api::TranscriptionSuccess,
        started: Instant,
    ) {
        let raw_text = success.transcript;
        if word_count(&raw_text) == 0 {
            handle_empty_transcription(&self.app, &self.saved.path, None);
            return;
        }
        let formatted =
            crate::spoken_formatting::apply_spoken_formatting(&raw_text, &self.settings.language);
        let (refined, cleaned) = self.refine(&formatted).await;
        let replaced = dictionary::apply_replacements(&refined, &self.settings.replacements);
        let final_text =
            user_snippets::apply_user_snippets(&replaced, &self.settings.user_snippets);
        if word_count(&final_text) == 0 {
            handle_empty_transcription(&self.app, &self.saved.path, None);
            return;
        }
        if self.cancelled() {
            return;
        }
        let route = TranscriptionRoute(&self.settings);
        let metadata = storage::TranscriptionMetadata {
            speech_model: success
                .speech_model
                .filter(|label| !label.trim().is_empty())
                .unwrap_or_else(|| route.storage_model()),
            llm_model: cleaned
                .then(|| llm_cleanup::resolved_model_label(&self.settings))
                .flatten(),
            word_count: word_count(&final_text),
            audio_duration_seconds: RecordingDuration(&self.saved).seconds(),
            synced: false,
            mode_id: self.mode_id.clone(),
            mode_name: self.mode_name.clone(),
            app_id: self.app_id.clone(),
        };
        let original = cleaned.then(|| raw_text.clone());
        tracing::info!(
            "[retry_transcription] Updating local record {}: text_len={} llm_cleaned={}",
            self.id,
            final_text.len(),
            cleaned
        );
        let updated = match self
            .app
            .state::<AppState>()
            .storage()
            .update_transcription_result(
                &self.id,
                final_text.clone(),
                original,
                storage::TranscriptionStatus::Success,
                None,
                metadata.clone(),
            ) {
            Ok(record) => record,
            Err(error) => {
                tracing::error!("Failed to save retry result: {error}");
                return;
            }
        };
        analytics::track_transcription_completed(
            &self.app,
            route.analytics_mode(),
            Some(&metadata.speech_model),
            cleaned,
            metadata.audio_duration_seconds,
            started.elapsed().as_secs_f32(),
            metadata.word_count,
            "microphone",
        );
        self.app
            .state::<AppState>()
            .record_transcription_completed();
        crate::emit_event(
            &self.app,
            EVENT_TRANSCRIPTION_COMPLETE,
            TranscriptionCompletePayload {
                transcript: final_text,
                auto_paste: false,
                record: updated,
            },
        );
    }

    async fn refine(&self, formatted: &str) -> (String, bool) {
        let requested =
            llm_cleanup::should_refine_transcript(&self.settings, self.personality.as_ref());
        let unavailable =
            requested && matches!(llm_cleanup::cached_preflight_available(), Some(false));
        if !requested || unavailable {
            if unavailable {
                maybe_warn_llm_unavailable(&self.app, false);
            }
            return (formatted.to_owned(), false);
        }
        let http = self.app.state::<AppState>().http();
        match llm_cleanup::cleanup_transcription(
            &self.app,
            &http,
            formatted,
            &self.settings,
            self.personality.as_ref(),
            None,
        )
        .await
        {
            Ok(text) => (text, true),
            Err(error) => {
                let issue = llm_cleanup::llm_issue_message(&error);
                tracing::error!("Cleanup failed during retry, using raw transcript: {issue}");
                llm_cleanup::note_preflight_failure();
                maybe_warn_llm_unavailable(&self.app, false);
                (formatted.to_owned(), false)
            }
        }
    }

    fn finish_failure(&self, error: anyhow::Error) {
        emit_transcription_error_inner(
            &self.app,
            format!("Transcription failed: {error}"),
            "transcription",
            RecordingDuration(&self.saved).seconds(),
            "microphone",
            self.saved.path.display().to_string(),
            None,
            true,
            false,
            !is_remote_fallback_unavailable(&error),
        );
    }
}

fn commit_transcription(app: &AppHandle<AppRuntime>, input: CompletionInput) -> bool {
    input.commit(app)
}

impl CompletionInput {
    fn commit(self, app: &AppHandle<AppRuntime>) -> bool {
        self.track(app);
        let (record, persisted) = self.persist(app);
        self.mirror(app, record.as_ref());
        crate::emit_event(
            app,
            EVENT_TRANSCRIPTION_COMPLETE,
            TranscriptionCompletePayload {
                transcript: self.final_transcript.clone(),
                auto_paste: self.auto_paste,
                record,
            },
        );
        app.state::<AppState>().pill().finish_processing(app);

        if self.temporary {
            let _ignored = std::fs::remove_file(&self.audio_path);
            discard_pending_recording(self.pending_path.as_deref());
            return true;
        }
        Self::refresh_surfaces(app);
        persisted
    }

    fn track(&self, app: &AppHandle<AppRuntime>) {
        analytics::track_transcription_completed(
            app,
            self.mode,
            Some(&self.metadata.speech_model),
            self.llm_cleaned,
            self.metadata.audio_duration_seconds,
            self.transcription_duration_seconds,
            self.metadata.word_count,
            self.audio_source,
        );
        app.state::<AppState>().record_transcription_completed();
    }

    fn persist(&self, app: &AppHandle<AppRuntime>) -> (Option<storage::TranscriptionRecord>, bool) {
        if self.temporary {
            return (None, true);
        }
        let repository = app.state::<AppState>().storage();
        let result = match self.llm_cleaned {
            true => repository.save_transcription_with_cleanup(
                self.raw_transcript.clone(),
                self.final_transcript.clone(),
                self.audio_path.clone(),
                self.metadata.clone(),
                None,
                self.timestamp_override,
            ),
            false => repository.save_transcription(
                self.final_transcript.clone(),
                self.audio_path.clone(),
                storage::TranscriptionStatus::Success,
                None,
                self.metadata.clone(),
                None,
                self.timestamp_override,
            ),
        };
        match result {
            Ok(record) => {
                discard_pending_recording(self.pending_path.as_deref());
                (Some(record), true)
            }
            Err(error) => {
                tracing::error!("Failed to persist transcription: {error}");
                (None, false)
            }
        }
    }

    fn mirror(&self, app: &AppHandle<AppRuntime>, record: Option<&storage::TranscriptionRecord>) {
        let Some(record) = record else {
            return;
        };
        let settings = app.state::<AppState>().current_settings_unmasked();
        if let Err(error) = crate::markdown_mirror::mirror_dictation(&settings, record) {
            tracing::warn!("Failed to update Markdown mirror for dictation: {error}");
        }
    }

    fn refresh_surfaces(app: &AppHandle<AppRuntime>) {
        let settings = app.state::<AppState>().current_settings();
        if let Err(error) = crate::tray::refresh_tray_menu(app, &settings) {
            tracing::error!("Failed to refresh tray menu: {error}");
        }
        #[cfg(target_os = "macos")]
        if let Err(error) = crate::set_app_menu(app, &settings) {
            tracing::error!("Failed to refresh app menu: {error}");
        }
        crate::schedule_recording_prune(app.clone(), settings.clone());
        crate::schedule_transcription_prune(app.clone(), settings);
        let update = app.state::<AppState>().update_state().clone();
        update_checker::maybe_show_update_toast(app, &update);
    }
}

fn discard_pending_recording(path: Option<&Path>) {
    path.into_iter().for_each(|pending| {
        let _ignored = std::fs::remove_file(pending);
    });
}

fn settle_cancelled_recording(
    app: &AppHandle<AppRuntime>,
    pending_path: Option<&Path>,
    collapse_pill: bool,
) {
    if collapse_pill {
        crate::pill::collapse_expanded_pill(app);
    }
    let state = app.state::<AppState>();
    state.pill().finish_processing(app);
    discard_pending_recording(pending_path);
    state.set_pending_path(None);
}

fn handle_empty_transcription(
    app: &AppHandle<AppRuntime>,
    audio_path: &Path,
    pending_path: Option<&Path>,
) {
    EmptyRecordingCleanup {
        audio_path,
        pending_path,
    }
    .finish(app);
}

struct EmptyRecordingCleanup<'a> {
    audio_path: &'a Path,
    pending_path: Option<&'a Path>,
}

impl EmptyRecordingCleanup<'_> {
    fn finish(self, app: &AppHandle<AppRuntime>) {
        let event = TranscriptionCompletePayload {
            transcript: String::new(),
            auto_paste: false,
            record: None,
        };
        crate::emit_event(app, EVENT_TRANSCRIPTION_COMPLETE, event);
        Notice::new("warning", "No words detected. Recording deleted.")
            .dismiss_after(3_000)
            .emit(app);
        self.remove_files();

        let state = app.state::<AppState>();
        let retention = state.current_settings();
        crate::schedule_recording_prune(app.clone(), retention.clone());
        crate::schedule_transcription_prune(app.clone(), retention);
        state.pill().finish_processing(app);
        state.set_pending_path(None);
    }

    fn remove_files(&self) {
        if self.audio_path.exists() {
            if let Err(error) = std::fs::remove_file(self.audio_path) {
                tracing::error!(
                    "Failed to remove empty transcription audio {}: {error}",
                    self.audio_path.display()
                );
            }
        }
        discard_pending_recording(self.pending_path);
    }
}

fn is_remote_fallback_unavailable(err: &anyhow::Error) -> bool {
    let diagnostic = err.to_string();
    remote_speech::is_fallback_unavailable_message(&diagnostic)
}

fn emit_auto_paste_error(
    app: &AppHandle<AppRuntime>,
    message: String,
    audio_duration_seconds: f32,
) {
    let settings = app.state::<AppState>().current_settings();
    analytics::track_transcription_failed(
        app,
        "auto_paste",
        transcription_mode_label(&settings),
        &resolve_speech_model_label(&settings),
        "paste_error",
        Some(audio_duration_seconds),
        "microphone",
    );

    Notice::new("error", message)
        .dismiss_after(3_000)
        .mode("local")
        .emit(app);
}

/// Shows a brief, dismissable toast after an auto-insertion, offering an
/// "Undo" action wired to `undo_last_insertion` (see
/// `AppState::set_last_insertion`). Kept intentionally light-touch (no
/// analytics, short duration) since this fires after every successful
/// dictation - unlike `emit_auto_paste_error`, which is reserved for cases
/// where the insertion attempt itself failed outright.
pub(crate) fn emit_insertion_toast(app: &AppHandle<AppRuntime>, toast_type: &str, message: &str) {
    Notice::new(toast_type, message)
        .dismiss_after(4_000)
        .primary_action("undo_last_insertion", "Undo")
        .emit(app);
}

#[allow(clippy::too_many_arguments)]
fn emit_transcription_error_inner(
    app: &AppHandle<AppRuntime>,
    message: String,
    stage: &str,
    audio_duration_seconds: f32,
    audio_source: &str,
    audio_path: String,
    pending_path: Option<&Path>,
    reset_state: bool,
    temporary: bool,
    show_toast: bool,
) {
    TranscriptionFailure {
        message,
        stage,
        audio_duration_seconds,
        audio_source,
        audio_path,
        pending_path,
        reset_state,
        temporary,
        show_toast,
    }
    .publish(app);
}

struct TranscriptionFailure<'a> {
    message: String,
    stage: &'a str,
    audio_duration_seconds: f32,
    audio_source: &'a str,
    audio_path: String,
    pending_path: Option<&'a Path>,
    reset_state: bool,
    temporary: bool,
    show_toast: bool,
}

impl TranscriptionFailure<'_> {
    fn publish(self, app: &AppHandle<AppRuntime>) {
        let state = app.state::<AppState>();
        let settings = state.current_settings();
        let route = TranscriptionRoute(&settings);
        analytics::track_transcription_failed(
            app,
            self.stage,
            route.analytics_mode(),
            &route.storage_model(),
            analytics::classify_failure_reason(&self.message),
            Some(self.audio_duration_seconds),
            self.audio_source,
        );
        crate::emit_event(
            app,
            EVENT_TRANSCRIPTION_ERROR,
            TranscriptionErrorPayload {
                message: self.message.clone(),
                stage: self.stage.to_owned(),
            },
        );

        let friendly_message = friendly_error_message(&self.message);
        self.persist_or_discard(app, &settings, &friendly_message);
        if state.pill().status() == crate::pill::PillStatus::Listening {
            return;
        }
        if self.show_toast {
            Notice::new("error", friendly_message)
                .mode("local")
                .emit(app);
        }
        crate::schedule_recording_prune(app.clone(), settings.clone());
        crate::schedule_transcription_prune(app.clone(), settings);
        if self.reset_state {
            state.pill().reset(app);
        }
    }

    fn persist_or_discard(
        &self,
        app: &AppHandle<AppRuntime>,
        settings: &UserSettings,
        friendly_message: &str,
    ) {
        if self.temporary {
            let _ignored = std::fs::remove_file(&self.audio_path);
            discard_pending_recording(self.pending_path);
            return;
        }
        let metadata = storage::TranscriptionMetadata {
            speech_model: TranscriptionRoute(settings).storage_model(),
            audio_duration_seconds: self.audio_duration_seconds,
            ..Default::default()
        };
        let saved = app.state::<AppState>().storage().save_transcription(
            String::new(),
            self.audio_path.clone(),
            storage::TranscriptionStatus::Error,
            Some(friendly_message.to_owned()),
            metadata,
            None,
            None,
        );
        match saved {
            Ok(record) => {
                discard_pending_recording(self.pending_path);
                let payload = crate::pill::PillErrorPayload {
                    retry_id: Some(record.id),
                };
                if let Err(error) = app.emit(crate::pill::EVENT_PILL_ERROR, payload) {
                    tracing::error!("Failed to emit pill error: {error}");
                }
            }
            Err(error) => {
                tracing::error!("Failed to persist failed transcription: {error}")
            }
        }
    }
}

fn friendly_error_message(message: &str) -> String {
    FriendlyError::classify(message).message().to_owned()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FriendlyError {
    ModelInstallation,
    ModelSelection,
    Microphone,
    Permission,
    PasteFallback,
    Generic,
}

impl FriendlyError {
    fn classify(message: &str) -> Self {
        let normalized = message.to_lowercase();
        let contains_any =
            |needles: &[&str]| needles.iter().any(|needle| normalized.contains(needle));
        if contains_any(&["not fully installed", "missing:"]) {
            Self::ModelInstallation
        } else if contains_any(&["model not found", "no model"]) {
            Self::ModelSelection
        } else if contains_any(&["microphone", "audio input"]) {
            Self::Microphone
        } else if contains_any(&["permission"]) {
            Self::Permission
        } else if contains_any(&["auto paste"]) {
            Self::PasteFallback
        } else {
            Self::Generic
        }
    }

    fn message(self) -> &'static str {
        match self {
            Self::ModelInstallation => "No transcription model installed",
            Self::ModelSelection => "No transcription model selected",
            Self::Microphone => "Microphone error",
            Self::Permission => "Permission denied",
            Self::PasteFallback => "Pasted to clipboard instead",
            Self::Generic => "Transcription failed",
        }
    }
}

struct TranscriptionMetadataInput<'a> {
    saved: &'a RecordingSaved,
    settings: &'a UserSettings,
    final_text: &'a str,
    llm_cleaned: bool,
    synced: bool,
    mode: Option<&'a Personality>,
    workflow: Option<&'a ModeRule>,
    speech_model: Option<String>,
    app_id: Option<&'a str>,
}

fn build_transcription_metadata(
    input: TranscriptionMetadataInput<'_>,
) -> storage::TranscriptionMetadata {
    let TranscriptionMetadataInput {
        saved,
        settings,
        final_text,
        llm_cleaned,
        synced,
        mode,
        workflow,
        speech_model,
        app_id,
    } = input;

    let selected_mode = workflow
        .map(|rule| (&rule.id, &rule.name))
        .or_else(|| mode.map(|personality| (&personality.id, &personality.name)));
    let (mode_id, mode_name) = selected_mode
        .map(|(id, name)| (Some(id.clone()), Some(name.clone())))
        .unwrap_or_default();
    let route = TranscriptionRoute(settings);
    storage::TranscriptionMetadata {
        speech_model: speech_model
            .filter(|label| !label.trim().is_empty())
            .unwrap_or_else(|| route.storage_model()),
        llm_model: llm_cleaned
            .then(|| llm_cleanup::resolved_model_label(settings))
            .flatten(),
        word_count: word_count(final_text),
        audio_duration_seconds: RecordingDuration(saved).seconds(),
        synced,
        mode_id,
        mode_name,
        app_id: app_id.map(str::to_owned),
    }
}

fn resolve_speech_model_label(settings: &UserSettings) -> String {
    TranscriptionRoute(settings).storage_model()
}

fn transcription_mode_label(settings: &UserSettings) -> &'static str {
    TranscriptionRoute(settings).analytics_mode()
}

struct TranscriptionRoute<'a>(&'a UserSettings);

impl TranscriptionRoute<'_> {
    fn is_remote(&self) -> bool {
        remote_speech::is_configured(self.0)
    }

    fn storage_model(&self) -> String {
        match self.is_remote() {
            true => remote_speech::speech_model_storage_label(self.0, None),
            false => model_manager::model_label(&self.0.local_model),
        }
    }

    fn analytics_mode(&self) -> &'static str {
        if self.is_remote() {
            "remote"
        } else {
            "local"
        }
    }
}

struct RecordingDuration<'a>(&'a RecordingSaved);

impl RecordingDuration<'_> {
    fn seconds(&self) -> f32 {
        self.0.duration_override_seconds.unwrap_or_else(|| {
            let millis = (self.0.ended_at - self.0.started_at)
                .num_milliseconds()
                .max(0);
            millis as f32 / 1000.0
        })
    }
}

pub(crate) fn count_words(text: &str) -> u32 {
    word_count(text)
}

fn word_count(text: &str) -> u32 {
    text.split_whitespace().fold(0_u32, |count, _| count + 1)
}

fn match_insertion_capitalization(text: &str, field_value: &str) -> String {
    InsertionCapitalization { text, field_value }.apply()
}

struct InsertionCapitalization<'a> {
    text: &'a str,
    field_value: &'a str,
}

impl InsertionCapitalization<'_> {
    fn apply(&self) -> String {
        let existing = self.field_value.trim_end_matches([' ', '\t']);
        if existing.is_empty() || Self::starts_new_phrase(existing) {
            return self.text.to_owned();
        }
        let Some((offset, letter)) = self
            .text
            .char_indices()
            .find(|(_, character)| character.is_alphabetic())
        else {
            return self.text.to_owned();
        };
        if Self::word_has_meaningful_case(self.text, offset) {
            return self.text.to_owned();
        }

        let mut adjusted = String::with_capacity(self.text.len());
        adjusted.push_str(&self.text[..offset]);
        adjusted.extend(letter.to_lowercase());
        adjusted.push_str(&self.text[offset + letter.len_utf8()..]);
        adjusted
    }

    fn starts_new_phrase(existing: &str) -> bool {
        existing
            .chars()
            .next_back()
            .is_some_and(|last| matches!(last, '.' | '!' | '?' | '…' | ':' | '\n' | '\r'))
            || existing
                .lines()
                .next_back()
                .is_some_and(Self::is_list_marker)
    }

    fn word_has_meaningful_case(text: &str, offset: usize) -> bool {
        let mut letters = text[offset..]
            .chars()
            .take_while(|character| character.is_alphabetic());
        let Some(_) = letters.next() else {
            return false;
        };
        let rest: Vec<char> = letters.collect();
        !rest.is_empty()
            && (rest.iter().all(|letter| !letter.is_lowercase())
                || rest.iter().any(|letter| letter.is_uppercase()))
    }

    fn is_list_marker(line: &str) -> bool {
        let marker = line.trim();
        matches!(marker, "-" | "*" | "+" | "•")
            || marker.strip_suffix(['.', ')']).is_some_and(|number| {
                !number.is_empty() && number.bytes().all(|byte| byte.is_ascii_digit())
            })
    }
}

pub(crate) fn load_audio_for_transcription(path: &Path) -> Result<(Vec<i16>, u32)> {
    WavPcm::read(path).map(|audio| (audio.samples, audio.sample_rate))
}

struct WavPcm {
    samples: Vec<i16>,
    sample_rate: u32,
}

impl WavPcm {
    fn read(path: &Path) -> Result<Self> {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension != "wav" {
            return Err(anyhow!("Unsupported audio format: {extension}"));
        }
        let file = std::fs::File::open(path)
            .with_context(|| format!("Failed to open WAV file at {}", path.display()))?;
        let mut reader =
            hound::WavReader::new(file).map_err(|error| anyhow!("WAV read error: {error}"))?;
        let format = reader.spec();
        if format.sample_format != hound::SampleFormat::Int {
            return Err(anyhow!("Unsupported WAV sample format"));
        }
        if format.bits_per_sample != 16 {
            return Err(anyhow!(
                "Unsupported WAV bits per sample: {}",
                format.bits_per_sample
            ));
        }
        let decoded = reader
            .samples::<i16>()
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|error| anyhow!("WAV read error: {error}"))?;
        let samples = match format.channels {
            0 | 1 => decoded,
            channels => crate::recorder::downmix_to_mono(&decoded, channels as usize),
        };
        if samples.is_empty() {
            return Err(anyhow!("No audio data decoded from WAV file"));
        }
        Ok(Self {
            samples,
            sample_rate: format.sample_rate,
        })
    }
}

pub(crate) struct LocalChunkingConfig<'a> {
    pub(crate) dictionary: &'a [String],
    pub(crate) language: Option<&'a str>,
    pub(crate) chunk_seconds: f32,
    pub(crate) overlap_seconds: f32,
    pub(crate) cancel_token: Option<&'a CancellationToken>,
    pub(crate) strip_hallucinated_thank_you: bool,
}

impl LocalChunkingConfig<'_> {
    fn long_form_options(&self, model: &model_manager::ReadyModel) -> looper_ts::LongFormOptions {
        let timestamp_mode = self
            .strip_hallucinated_thank_you
            .then(|| {
                model_manager::model_supports_capability(
                    &model.key,
                    model_manager::MODEL_CAPABILITY_TIMESTAMPS,
                )
            })
            .filter(|supported| *supported)
            .map(|_| looper_ts::TimestampMode::Word)
            .unwrap_or(looper_ts::TimestampMode::None);
        looper_ts::LongFormOptions {
            chunking: looper_ts::LongFormConfig {
                chunk_seconds: self.chunk_seconds,
                overlap_seconds: self.overlap_seconds,
                minimum_new_audio_ratio: crate::speech::engine::chunk_policy(model.engine)
                    .minimum_new_audio_ratio,
            },
            transcription: looper_ts::TranscribeOptions {
                language: self.language.map(str::to_owned),
                timestamps: timestamp_mode,
            },
            minimum_file_speech_ratio: speech::VAD_MIN_SPEECH_PERCENT_FILE / 100.0,
            minimum_chunk_speech_ratio: speech::VAD_MIN_SPEECH_PERCENT_CHUNK / 100.0,
            minimum_final_speech_ratio: speech::VAD_MIN_SPEECH_PERCENT_FILE / 100.0,
            filter_by_speech_regions: self.strip_hallucinated_thank_you,
            merge: looper_ts::MergeOptions::default(),
        }
    }
}

pub(crate) fn transcribe_local_chunked(
    transcriber: &crate::local_transcription::LocalTranscriber,
    model: &model_manager::ReadyModel,
    samples: &[i16],
    sample_rate: u32,
    config: LocalChunkingConfig<'_>,
) -> Result<transcription_api::TranscriptionSuccess> {
    if samples.is_empty() {
        return Err(anyhow!("No audio samples provided"));
    }
    let options = config.long_form_options(model);
    let _dictionary_terms = config.dictionary;
    let cancellation = config.cancel_token;
    let mut result = transcriber.transcribe_long(model, samples, sample_rate, &options, || {
        cancellation.is_some_and(CancellationToken::is_cancelled)
    })?;
    result.segments = None;
    result.words = None;
    Ok(result)
}

fn maybe_warn_llm_unavailable(app: &AppHandle<AppRuntime>, is_edit_mode: bool) {
    if !llm_cleanup::should_show_unavailable_notice() {
        return;
    }

    if is_edit_mode {
        Notice::new("error", "Language model unreachable. Edit mode won't run.")
            .title("Edit Mode")
            .dismiss_after(10_000)
            .primary_action("open_llm_cleanup_settings", "Open Settings")
            .emit(app);
    } else {
        toast::show_with_action(
            app,
            "warning",
            Some("Language Model"),
            "Language model unreachable. Transcript refinement was skipped.",
            "open_llm_cleanup_settings",
            "Open Settings",
        );
    }
}

pub(crate) fn finalize_streaming_transcription(
    app: &AppHandle<AppRuntime>,
    input: StreamingTranscriptionInput,
) {
    let StreamingTranscriptionInput {
        raw_transcript,
        duration_seconds,
        audio_path,
        pending_path,
        settings,
        active_mode,
        temporary,
        cancel_token,
    } = input;

    let state = app.state::<AppState>();
    let pending_selected_text = state.take_pending_selected_text();
    let active_app_id = accessibility_context::get_active_context()
        .and_then(|context| context.bundle_id)
        .filter(|value| !value.trim().is_empty());
    let http = state.http();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let transcription_started_at = Instant::now();
        let cancel_for_check = cancel_token.clone();
        let is_cancelled = move || cancel_for_check.is_cancelled();
        let auto_paste = transcription_api::auto_paste_enabled();
        let active_workflow = mode_context::resolve_active_mode_rule(&settings);
        let raw_transcript = transcription_api::normalize_transcript(&raw_transcript);

        if count_words(&raw_transcript) == 0 {
            crate::pill::collapse_expanded_pill(&app_handle);
            handle_empty_transcription(&app_handle, &audio_path, pending_path.as_deref());
            return;
        }

        if is_cancelled() {
            settle_cancelled_recording(&app_handle, pending_path.as_deref(), true);
            return;
        }

        let processed = match process_transcript_text(
            &app_handle,
            &http,
            ProcessTranscriptInput {
                raw_transcript: raw_transcript.clone(),
                pending_selected_text,
                settings: &settings,
                active_mode: active_mode.as_ref(),
                auto_paste,
                log_context: Some("streaming"),
                cancel_token: Some(&cancel_token),
                keep_pill_expanded: true,
                audio_duration_seconds: duration_seconds,
            },
        )
        .await
        {
            ProcessTranscriptOutcome::Ready(processed) => processed,
            ProcessTranscriptOutcome::Empty => {
                handle_empty_transcription(&app_handle, &audio_path, pending_path.as_deref());
                return;
            }
            ProcessTranscriptOutcome::Cancelled => {
                settle_cancelled_recording(&app_handle, pending_path.as_deref(), true);
                return;
            }
        };

        if is_cancelled() {
            settle_cancelled_recording(&app_handle, pending_path.as_deref(), true);
            return;
        }

        let metadata = storage::TranscriptionMetadata {
            speech_model: resolve_speech_model_label(&settings),
            llm_model: if processed.llm_cleaned {
                llm_cleanup::resolved_model_label(&settings)
            } else {
                None
            },
            word_count: count_words(&processed.final_transcript),
            audio_duration_seconds: duration_seconds,
            synced: false,
            mode_id: active_workflow
                .as_ref()
                .map(|rule| rule.id.clone())
                .or_else(|| active_mode.as_ref().map(|mode| mode.id.clone())),
            mode_name: active_workflow
                .as_ref()
                .map(|rule| rule.name.clone())
                .or_else(|| active_mode.as_ref().map(|mode| mode.name.clone())),
            app_id: active_app_id,
        };

        crate::pill::collapse_expanded_pill(&app_handle);
        commit_transcription(
            &app_handle,
            CompletionInput {
                raw_transcript,
                final_transcript: processed.final_transcript,
                auto_paste: processed.pasted,
                audio_path: audio_path.display().to_string(),
                pending_path,
                llm_cleaned: processed.llm_cleaned,
                metadata,
                mode: "local_streaming",
                transcription_duration_seconds: transcription_started_at.elapsed().as_secs_f32(),
                audio_source: "microphone",
                temporary,
                timestamp_override: None,
            },
        );
        app_handle.state::<AppState>().set_pending_path(None);
    });
}

#[cfg(test)]
mod selection_mode_action_gating_tests {
    use super::*;

    #[test]
    fn friendly_errors_keep_specific_categories_ahead_of_generic_failures() {
        let cases = [
            ("model missing: encoder", "No transcription model installed"),
            ("no model configured", "No transcription model selected"),
            ("microphone disconnected", "Microphone error"),
            ("permission rejected", "Permission denied"),
            ("auto paste unavailable", "Pasted to clipboard instead"),
            ("unexpected backend response", "Transcription failed"),
        ];
        for (diagnostic, expected) in cases {
            assert_eq!(friendly_error_message(diagnostic), expected);
        }
    }

    #[test]
    fn insertion_capitalization_only_lowers_plain_words_in_continuations() {
        assert_eq!(
            match_insertion_capitalization("Hello world", "Existing text"),
            "hello world"
        );
        assert_eq!(
            match_insertion_capitalization("Árbol verde", "Existing text"),
            "árbol verde"
        );
        assert_eq!(
            match_insertion_capitalization("NASA mission", "Existing text"),
            "NASA mission"
        );
        assert_eq!(
            match_insertion_capitalization("iPhone works", "Existing text"),
            "iPhone works"
        );
    }

    #[test]
    fn insertion_capitalization_respects_boundaries_and_list_markers() {
        for existing in ["", "Finished.", "Question?", "Heading:", "-", "12)"] {
            assert_eq!(
                match_insertion_capitalization("Next sentence", existing),
                "Next sentence"
            );
        }
    }

    #[test]
    fn word_count_uses_unicode_whitespace_boundaries() {
        assert_eq!(count_words(" uno\tdos\n三 "), 3);
        assert_eq!(count_words(" \n\t "), 0);
    }

    #[test]
    fn audio_loader_rejects_non_wav_before_touching_the_filesystem() {
        let error = load_audio_for_transcription(Path::new("missing.MP3"))
            .expect_err("MP3 must be rejected");
        assert_eq!(error.to_string(), "Unsupported audio format: mp3");
    }

    /// F2 explicit requirement: prove `ask` (and `copy`) can never reach
    /// `assistive::insert_text`. `insertion_is_reachable` is the exact
    /// predicate `process_transcript_text` checks before its only call
    /// sites for `assistive::insert_text`/`insert_after_selection` (see the
    /// early return right above the preview gate) - this pins its truth
    /// table so a future edit can't silently let Ask/Copy fall through.
    ///
    /// This is a unit test on that gating predicate rather than a full
    /// end-to-end run of `process_transcript_text`, which needs a live
    /// `AppHandle<AppRuntime>`/`AppState` (recorder, settings store, pill
    /// controller, ...) that this codebase has no mock/test harness for
    /// yet - building one is out of scope here. The guarantee this test
    /// gives is structural: `Ask`/`Copy` return out of the function via
    /// this exact check before the auto-paste block, which is the only
    /// place in `process_transcript_text` that calls
    /// `assistive::insert_text`/`insert_after_selection`.
    #[test]
    fn ask_and_copy_never_reach_the_insertion_gate() {
        assert!(!insertion_is_reachable(true, EditAction::Ask));
        assert!(!insertion_is_reachable(true, EditAction::Copy));
    }

    #[test]
    fn replace_and_insert_reach_the_insertion_gate_in_selection_mode() {
        assert!(insertion_is_reachable(true, EditAction::Replace));
        assert!(insertion_is_reachable(true, EditAction::Insert));
    }

    #[test]
    fn plain_dictation_always_reaches_the_insertion_gate() {
        for action in EditAction::ALL {
            assert!(insertion_is_reachable(false, action));
        }
    }

    #[test]
    fn unverified_insertion_keeps_the_transcript_visible_for_copying() {
        let outcome = assistive::InsertOutcome {
            method: assistive::InsertionMethod::Paste,
            verified: false,
            confirmed_failure: false,
        };

        assert!(should_show_copy_result_after_insertion(&outcome));
    }

    #[test]
    fn verified_insertion_does_not_show_the_copy_fallback() {
        let outcome = assistive::InsertOutcome {
            method: assistive::InsertionMethod::AxDirect,
            verified: true,
            confirmed_failure: false,
        };

        assert!(!should_show_copy_result_after_insertion(&outcome));
    }
}
