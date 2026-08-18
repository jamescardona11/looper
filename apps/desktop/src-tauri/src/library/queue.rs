use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{anyhow, Result};
use chrono::Utc;
use tauri::{async_runtime, AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::transcribe::count_words;
use crate::{
    dictionary, model_manager, remote_speech, settings::UserSettings, storage::StorageManager,
    toast, transcribe, user_snippets, AppRuntime, AppState, LibraryJob, LibraryJobKind,
};

use super::processing::{
    convert_library_item, convert_library_item_with_progress_range, convert_segments_to_ms,
    diarize_segments, read_wav_info, stream_wav_chunks, WavInfo,
};
use super::types::{
    cancelled_error, is_cancelled_error, is_ffmpeg_error_message, LibraryCompletePayload,
    LibraryErrorPayload, LibraryItem, LibraryItemPatch, LibraryItemStatus, LibraryProgressPayload,
    LibraryProgressUpdate, LibraryTranscriptionResult, MeetingTranscriptSegment, Speaker,
    TranscriptSegment, CHUNK_OVERLAP_SECONDS, DIRECT_TRANSCRIBE_MINUTES, EVENT_LIBRARY_COMPLETE,
    EVENT_LIBRARY_ERROR, EVENT_LIBRARY_PROGRESS, MAX_CHUNK_MINUTES,
};
use crate::speech::{VAD_MIN_SPEECH_PERCENT_CHUNK, VAD_MIN_SPEECH_PERCENT_FILE};

enum JobPreparation {
    File {
        source_path: PathBuf,
        store_original: bool,
    },
    Youtube {
        url: String,
        store_original: bool,
    },
}

impl JobPreparation {
    fn from_kind(kind: LibraryJobKind) -> Option<Self> {
        match kind {
            LibraryJobKind::Import {
                source_path,
                store_original,
            } => Some(Self::File {
                source_path,
                store_original,
            }),
            LibraryJobKind::ImportYoutube {
                url,
                store_original,
            } => Some(Self::Youtube {
                url,
                store_original,
            }),
            LibraryJobKind::TranscribeExisting => None,
        }
    }

    fn task_name(&self) -> &'static str {
        match self {
            Self::File { .. } => "Library import",
            Self::Youtube { .. } => "YouTube import",
        }
    }

    fn run(
        self,
        app: &AppHandle<AppRuntime>,
        state: &AppState,
        id: &str,
        token: &CancellationToken,
    ) -> Result<()> {
        match self {
            Self::File {
                source_path,
                store_original,
            } => convert_library_item(app, state, id, &source_path, store_original, token),
            Self::Youtube {
                url,
                store_original,
            } => {
                let source_path = super::youtube::download_youtube_audio(app, id, &url, token)?;
                let result = convert_library_item_with_progress_range(
                    app,
                    state,
                    id,
                    &source_path,
                    store_original,
                    token,
                    super::youtube::download_progress_share(),
                    1.0,
                );
                super::youtube::cleanup_youtube_download(app, id);
                result
            }
        }
    }
}

struct ProgressReporter<'a> {
    app: &'a AppHandle<AppRuntime>,
    storage: Arc<StorageManager>,
    item_id: &'a str,
}

impl<'a> ProgressReporter<'a> {
    fn new(app: &'a AppHandle<AppRuntime>, storage: Arc<StorageManager>, item_id: &'a str) -> Self {
        Self {
            app,
            storage,
            item_id,
        }
    }

    fn begin(&self) {
        let _ = self.storage.update_library_item(
            self.item_id,
            LibraryItemPatch {
                status: Some(LibraryItemStatus::Transcribing { progress: 0.0 }),
                transcript: Some(String::new()),
                segments: Some(Vec::new()),
                ..Default::default()
            },
        );
        self.emit(LibraryProgressPayload {
            id: self.item_id.to_owned(),
            progress: 0.0,
            current_chunk: 0,
            total_chunks: 0,
            chunk_text: None,
            chunk_segments: None,
        });
    }

    fn publish(&self, update: LibraryProgressUpdate) {
        let LibraryProgressUpdate {
            progress,
            current_chunk,
            total_chunks,
            transcript,
            segments,
            chunk_text,
            chunk_segments,
        } = update;
        let _ = self.storage.update_library_item(
            self.item_id,
            LibraryItemPatch {
                status: Some(LibraryItemStatus::Transcribing { progress }),
                transcript,
                segments,
                ..Default::default()
            },
        );
        self.emit(LibraryProgressPayload {
            id: self.item_id.to_owned(),
            progress,
            current_chunk,
            total_chunks,
            chunk_text,
            chunk_segments,
        });
    }

    fn emit(&self, payload: LibraryProgressPayload) {
        let _ = self.app.emit(EVENT_LIBRARY_PROGRESS, payload);
    }
}

fn emit_library_error(
    app: &AppHandle<AppRuntime>,
    id: &str,
    message: impl Into<String>,
    cancelled: bool,
) {
    let _ = app.emit(
        EVENT_LIBRARY_ERROR,
        LibraryErrorPayload {
            id: id.to_owned(),
            message: message.into(),
            cancelled,
        },
    );
}

fn set_library_status(storage: &StorageManager, id: &str, status: LibraryItemStatus) {
    let _ = storage.update_library_item(
        id,
        LibraryItemPatch {
            status: Some(status),
            ..Default::default()
        },
    );
}

fn start_library_job_internal(app: &AppHandle<AppRuntime>, job: LibraryJob) {
    let app_handle = app.clone();
    async_runtime::spawn(async move {
        let state_handle = app_handle.state::<AppState>();
        let job_id = job.id.clone();
        let token = state_handle.register_library_transcription(job_id.clone());

        if let Some(preparation) = JobPreparation::from_kind(job.kind) {
            let task_name = preparation.task_name();
            let task_app = app_handle.clone();
            let task_id = job_id.clone();
            let task_token = token.clone();
            let prepared = async_runtime::spawn_blocking(move || {
                let task_state = task_app.state::<AppState>();
                preparation.run(&task_app, &task_state, &task_id, &task_token)
            })
            .await;
            let preparation_result = match prepared {
                Ok(result) => result,
                Err(error) => Err(anyhow!("{task_name} task failed: {error}")),
            };
            if let Err(error) = preparation_result {
                handle_library_job_error(&app_handle, &state_handle, &job_id, error);
                return;
            }
        }

        if token.is_cancelled() {
            handle_library_job_error(&app_handle, &state_handle, &job_id, cancelled_error());
            return;
        }
        start_library_transcription_internal(&app_handle, &state_handle, job_id);
    });
}

fn start_library_transcription_internal(
    app: &AppHandle<AppRuntime>,
    state: &tauri::State<'_, AppState>,
    id: String,
) {
    let storage = state.storage();
    let item = match storage.get_library_item(&id) {
        Ok(Some(item)) => item,
        Ok(None) => {
            tracing::error!("Library item not found for transcription: {id}");
            emit_library_error(app, &id, "Library item not found", false);
            release_library_slot(app, state, &id);
            return;
        }
        Err(err) => {
            tracing::error!("Failed to load library item {id}: {err}");
            emit_library_error(
                app,
                &id,
                format!("Failed to load library item: {err}"),
                false,
            );
            release_library_slot(app, state, &id);
            return;
        }
    };

    if !may_begin_transcription(&item.status) {
        release_library_slot(app, state, &id);
        return;
    }

    ProgressReporter::new(app, storage.clone(), &id).begin();

    let token = state.register_library_transcription(id.clone());
    let app_handle = app.clone();
    let item_for_task = item.clone();
    let transcription_started_at = Instant::now();
    async_runtime::spawn(async move {
        let id_for_release = id.clone();
        let token_handle = token.clone();
        let app_for_task = app_handle.clone();
        let result = async_runtime::spawn_blocking(move || {
            let state_handle = app_for_task.state::<AppState>();
            LibraryTranscriber::new(&app_for_task, &state_handle, &item_for_task, &token_handle)
                .run()
        })
        .await;

        let state_handle = app_handle.state::<AppState>();

        match result {
            Ok(Ok(result)) => finish_successful_transcription(
                &app_handle,
                &state_handle,
                &storage,
                &item,
                &id,
                transcription_started_at,
                result,
            ),
            Ok(Err(error)) => finish_transcription_error(&app_handle, &storage, &item, &id, error),
            Err(error) => finish_worker_failure(&app_handle, &storage, &item, &id, &error),
        }

        release_library_slot(&app_handle, &state_handle, &id_for_release);
    });
}

fn may_begin_transcription(status: &LibraryItemStatus) -> bool {
    !matches!(
        status,
        LibraryItemStatus::Cancelling
            | LibraryItemStatus::Cancelled
            | LibraryItemStatus::Transcribing { .. }
    )
}

fn finish_successful_transcription(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    storage: &StorageManager,
    item: &LibraryItem,
    id: &str,
    started_at: Instant,
    mut result: LibraryTranscriptionResult,
) {
    let settings = state.current_settings();
    let mut transcript = apply_text_rules(&result.transcript, &settings);
    apply_timed_replacements(&mut result, &settings);

    if count_words(&transcript) == 0 && item.kind == "meeting" {
        if let Some(fallback) = load_live_meeting_fallback(storage, id) {
            transcript = apply_text_rules(&fallback.transcript, &settings);
            result.segments = Some(fallback.segments);
            result.speakers = Some(fallback.speakers);
        }
    }

    let speech_model = effective_speech_model(&result, item);
    if count_words(&transcript) == 0 {
        track_library_failure(app, item, speech_model, "no_speech");
        record_failure(app, storage, id, "No speech detected", false);
        return;
    }

    track_library_completion(app, item, speech_model, &transcript, started_at);
    if let Err(error) =
        persist_successful_transcription(storage, id, transcript, result, &Utc::now().to_rfc3339())
    {
        let message = format!("Failed to save library transcription: {error}");
        tracing::error!("{message}");
        emit_library_error(app, id, message, false);
        return;
    }

    mirror_completed_item(app, storage, id);
    let _ = app.emit(
        EVENT_LIBRARY_COMPLETE,
        LibraryCompletePayload { id: id.to_owned() },
    );
    if item.kind == "meeting" {
        if let Err(error) = super::meeting_summary::schedule_meeting_summary(app, id.to_owned()) {
            tracing::warn!("Meeting summary was not scheduled: {error}");
        }
    }
}

fn apply_text_rules(text: &str, settings: &UserSettings) -> String {
    let replaced = dictionary::apply_replacements(text, &settings.replacements);
    user_snippets::apply_user_snippets(&replaced, &settings.user_snippets)
}

fn apply_timed_replacements(result: &mut LibraryTranscriptionResult, settings: &UserSettings) {
    if settings.replacements.is_empty() {
        return;
    }
    let timed_entries = result.segments.iter_mut().chain(result.words.iter_mut());
    for entry in timed_entries.flatten() {
        entry.text = dictionary::apply_replacements(&entry.text, &settings.replacements);
    }
}

fn load_live_meeting_fallback(
    storage: &StorageManager,
    id: &str,
) -> Option<LiveMeetingTranscriptFallback> {
    match storage.get_meeting_details(id) {
        Ok(Some(details)) => live_meeting_transcript_fallback(&details.live_transcript),
        Ok(None) => None,
        Err(error) => {
            tracing::warn!("Failed to read persisted live transcript for {id}: {error}");
            None
        }
    }
}

fn effective_speech_model<'a>(
    result: &'a LibraryTranscriptionResult,
    item: &'a LibraryItem,
) -> &'a str {
    result
        .speech_model
        .as_deref()
        .filter(|model| !model.trim().is_empty())
        .unwrap_or(&item.speech_model)
}

fn track_library_completion(
    app: &AppHandle<AppRuntime>,
    item: &LibraryItem,
    speech_model: &str,
    transcript: &str,
    started_at: Instant,
) {
    let model_label = model_manager::model_label(speech_model);
    crate::analytics::track_transcription_completed(
        app,
        library_transcription_mode(speech_model),
        Some(&model_label),
        false,
        item.duration_seconds,
        started_at.elapsed().as_secs_f32(),
        count_words(transcript),
        "uploaded_file",
    );
}

fn finish_transcription_error(
    app: &AppHandle<AppRuntime>,
    storage: &StorageManager,
    item: &LibraryItem,
    id: &str,
    error: anyhow::Error,
) {
    let cancelled = is_cancelled_error(&error);
    let message = error.to_string();
    if !cancelled {
        let reason = crate::analytics::classify_failure_reason(&message);
        track_library_failure(app, item, &item.speech_model, reason);
    }
    record_failure(app, storage, id, message, cancelled);
}

fn finish_worker_failure(
    app: &AppHandle<AppRuntime>,
    storage: &StorageManager,
    item: &LibraryItem,
    id: &str,
    error: &impl std::fmt::Display,
) {
    track_library_failure(app, item, &item.speech_model, "task_failed");
    record_failure(
        app,
        storage,
        id,
        format!("Library transcription task failed: {error}"),
        false,
    );
}

fn track_library_failure(
    app: &AppHandle<AppRuntime>,
    item: &LibraryItem,
    model: &str,
    reason: &str,
) {
    crate::analytics::track_transcription_failed(
        app,
        "transcription",
        library_transcription_mode(model),
        model,
        reason,
        Some(item.duration_seconds),
        "uploaded_file",
    );
}

fn record_failure(
    app: &AppHandle<AppRuntime>,
    storage: &StorageManager,
    id: &str,
    message: impl Into<String>,
    cancelled: bool,
) {
    let message = message.into();
    let status = if cancelled {
        LibraryItemStatus::Cancelled
    } else {
        LibraryItemStatus::Error {
            message: message.clone(),
        }
    };
    set_library_status(storage, id, status);
    emit_library_error(app, id, message, cancelled);
}

fn mirror_completed_item(app: &AppHandle<AppRuntime>, storage: &StorageManager, id: &str) {
    let settings = app.state::<AppState>().current_settings_unmasked();
    if let Err(error) = crate::markdown_mirror::mirror_library_by_id(&settings, storage, id) {
        tracing::warn!("Failed to update Markdown mirror for Library item: {error}");
    }
}

fn handle_library_job_error(
    app: &AppHandle<AppRuntime>,
    state: &tauri::State<'_, AppState>,
    id: &str,
    err: anyhow::Error,
) {
    let cancelled = is_cancelled_error(&err);
    let message = err.to_string();
    if is_ffmpeg_error_message(&message) && state.should_show_ffmpeg_toast() {
        toast::show_with_action(
            app,
            "error",
            Some("FFmpeg Required"),
            "FFmpeg is required to import this file.",
            "open_ffmpeg_install",
            "FFmpeg Help",
        );
    }
    record_failure(app, &state.storage(), id, message, cancelled);
    release_library_slot(app, state, id);
}

fn library_transcription_mode(model: &str) -> &'static str {
    if remote_speech::is_remote_model(model) {
        "remote"
    } else {
        "local"
    }
}

pub(super) fn persist_successful_transcription(
    storage: &StorageManager,
    id: &str,
    final_transcript: String,
    mut result: LibraryTranscriptionResult,
    transcribed_at: &str,
) -> Result<()> {
    let mut patch = LibraryItemPatch::default();
    patch.status = Some(LibraryItemStatus::Complete);
    patch.transcript = Some(final_transcript);
    patch.segments = result.segments.take();
    patch.words = result.words.take();
    patch.speech_model = result.speech_model.take();
    patch.speakers = Some(result.speakers.take());
    patch.transcribed_at = Some(transcribed_at.to_owned());

    match storage.update_library_item(id, patch)? {
        Some(_) => Ok(()),
        None => Err(anyhow!("Library item not found: {id}")),
    }
}

struct LiveMeetingTranscriptFallback {
    transcript: String,
    segments: Vec<TranscriptSegment>,
    speakers: Vec<Speaker>,
}

fn live_meeting_transcript_fallback(
    live_transcript: &[MeetingTranscriptSegment],
) -> Option<LiveMeetingTranscriptFallback> {
    let mut segments = live_transcript
        .iter()
        .filter(|segment| count_words(segment.text.trim()) > 0)
        .collect::<Vec<_>>();
    segments.sort_by_key(|segment| (segment.start_ms, segment.end_ms, segment.id.as_str()));
    if segments.is_empty() {
        return None;
    }

    let transcript = segments
        .iter()
        .map(|segment| segment.text.trim())
        .collect::<Vec<_>>()
        .join(" ");
    let timed_segments = segments
        .iter()
        .map(|segment| TranscriptSegment {
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            text: segment.text.trim().to_string(),
            speaker_id: Some(segment.source.as_str().to_string()),
        })
        .collect();
    let speakers = [
        (super::types::MeetingTranscriptSource::You, "You"),
        (super::types::MeetingTranscriptSource::Them, "Them"),
    ]
    .into_iter()
    .filter(|(source, _)| segments.iter().any(|segment| segment.source == *source))
    .map(|(source, name)| Speaker {
        id: source.as_str().to_string(),
        name: name.to_string(),
        color: None,
    })
    .collect();

    Some(LiveMeetingTranscriptFallback {
        transcript,
        segments: timed_segments,
        speakers,
    })
}

pub(crate) fn schedule_library_job(app: &AppHandle<AppRuntime>, state: &AppState, job: LibraryJob) {
    if !state.enqueue_library_job(job) {
        return;
    }
    start_next_library_job(app, state);
}

fn start_next_library_job(app: &AppHandle<AppRuntime>, state: &AppState) {
    let Some(job) = state.claim_next_library_job() else {
        return;
    };
    start_library_job_internal(app, job);
}

pub(crate) fn release_library_slot(app: &AppHandle<AppRuntime>, state: &AppState, id: &str) {
    state.clear_active_library_job(id);
    state.clear_library_transcription(id);
    start_next_library_job(app, state);
}

struct LocalRun<'a> {
    app: &'a AppHandle<AppRuntime>,
    state: &'a AppState,
    item: &'a LibraryItem,
    token: &'a CancellationToken,
    model: &'a model_manager::ReadyModel,
    dictionary: &'a [String],
    language: &'a str,
    sample_rate: u32,
}

struct LibraryTranscriber<'a> {
    app: &'a AppHandle<AppRuntime>,
    state: &'a AppState,
    item: &'a LibraryItem,
    token: &'a CancellationToken,
}

impl<'a> LibraryTranscriber<'a> {
    fn new(
        app: &'a AppHandle<AppRuntime>,
        state: &'a AppState,
        item: &'a LibraryItem,
        token: &'a CancellationToken,
    ) -> Self {
        Self {
            app,
            state,
            item,
            token,
        }
    }

    fn run(&self) -> Result<LibraryTranscriptionResult> {
        self.cancellation_checkpoint()?;
        let (audio_path, wav_info) = self.inspect_audio()?;
        let settings = self.state.current_settings();
        let requested_remote = remote_speech::is_remote_model(&self.item.speech_model);
        let remote_fallback = if requested_remote && remote_speech::is_configured(&settings) {
            match self.try_remote(&settings, &audio_path)? {
                Some(result) => return Ok(result),
                None => true,
            }
        } else {
            false
        };
        let model = if requested_remote || remote_fallback {
            model_manager::ensure_local_fallback_model(self.app, &settings.local_model)?
        } else {
            model_manager::ensure_model_ready(self.app, &self.item.speech_model)?
        };
        let vocabulary = dictionary::dictionary_entries_for_model(&model, &settings);
        let local = LocalRun {
            app: self.app,
            state: self.state,
            item: self.item,
            token: self.token,
            model: &model,
            dictionary: &vocabulary,
            language: &settings.language,
            sample_rate: wav_info.sample_rate,
        };
        local.execute(&audio_path, &wav_info)
    }

    fn cancellation_checkpoint(&self) -> Result<()> {
        if self.token.is_cancelled() {
            Err(cancelled_error())
        } else {
            Ok(())
        }
    }

    fn inspect_audio(&self) -> Result<(PathBuf, WavInfo)> {
        let path = PathBuf::from(&self.item.audio_path);
        if !path.exists() {
            return Err(anyhow!("Audio file not found"));
        }
        let info = read_wav_info(&path)?;
        if info.total_samples == 0 {
            return Err(anyhow!("No audio data decoded from WAV file"));
        }
        Ok((path, info))
    }

    fn try_remote(
        &self,
        settings: &UserSettings,
        audio_path: &Path,
    ) -> Result<Option<LibraryTranscriptionResult>> {
        let http = self.state.http();
        let attempt = async_runtime::block_on(remote_speech::attempt_remote(
            self.app,
            &http,
            settings,
            audio_path,
            &settings.local_model,
            remote_speech::TranscribeOptions {
                timestamps: true,
                diarization: self.item.detect_speakers,
            },
            || self.token.is_cancelled(),
        ));
        match attempt {
            remote_speech::RemoteAttempt::Success(success) => {
                let result = success.transcription;
                ProgressReporter::new(self.app, self.state.storage(), &self.item.id)
                    .publish(LibraryProgressUpdate::with_chunk_counts(1.0, 1, 1));
                let (segments, speakers) = match success.diarized_segments.as_deref() {
                    Some(diarized) => {
                        let (converted, speakers) = diarize_segments(diarized);
                        (Some(converted), speakers)
                    }
                    None => (result.segments.as_deref().map(convert_segments_to_ms), None),
                };
                Ok(Some(LibraryTranscriptionResult {
                    transcript: result.transcript,
                    segments,
                    words: result.words.as_deref().map(convert_segments_to_ms),
                    speech_model: result.speech_model,
                    speakers,
                }))
            }
            remote_speech::RemoteAttempt::Cancelled => Err(cancelled_error()),
            remote_speech::RemoteAttempt::Unavailable(message) => Err(anyhow!(message)),
            remote_speech::RemoteAttempt::Fallback => Ok(None),
        }
    }
}

impl LocalRun<'_> {
    fn execute(&self, audio_path: &Path, wav_info: &WavInfo) -> Result<LibraryTranscriptionResult> {
        if matches!(self.model.engine, model_manager::LocalModelEngine::Cohere) {
            let policy = crate::speech::engine::chunk_policy(self.model.engine);
            self.transcribe_long_form(
                audio_path,
                wav_info,
                policy.chunk_seconds as u32,
                policy.overlap_seconds as u32,
            )
        } else if wav_info.duration_seconds <= DIRECT_TRANSCRIBE_MINUTES as f32 * 60.0 {
            self.transcribe_direct(audio_path)
        } else {
            self.transcribe_long_form(
                audio_path,
                wav_info,
                MAX_CHUNK_MINUTES * 60,
                CHUNK_OVERLAP_SECONDS,
            )
        }
    }

    fn transcribe_direct(&self, audio_path: &Path) -> Result<LibraryTranscriptionResult> {
        let (samples, sample_rate) = transcribe::load_audio_for_transcription(audio_path)?;
        let speech_ratio =
            looper_ts::speech_ratio(&samples, sample_rate, looper_ts::VadMode::VeryAggressive)
                .unwrap_or(1.0);
        if speech_ratio * 100.0 < VAD_MIN_SPEECH_PERCENT_FILE {
            return Ok(empty_transcription());
        }

        let transcript = self.state.local_transcriber().transcribe_with_segments(
            self.model,
            &samples,
            sample_rate,
            self.dictionary,
            Some(self.language),
        )?;
        if self.token.is_cancelled() {
            return Err(cancelled_error());
        }
        Ok(LibraryTranscriptionResult {
            transcript: transcript.transcript,
            segments: transcript.segments.as_deref().map(convert_segments_to_ms),
            words: transcript.words.as_deref().map(convert_segments_to_ms),
            speech_model: None,
            speakers: None,
        })
    }

    fn transcribe_long_form(
        &self,
        audio_path: &Path,
        wav_info: &WavInfo,
        chunk_seconds: u32,
        overlap_seconds: u32,
    ) -> Result<LibraryTranscriptionResult> {
        let transcriber = self.state.local_transcriber();
        let config = looper_ts::LongFormConfig {
            chunk_seconds: chunk_seconds as f32,
            overlap_seconds: overlap_seconds as f32,
            minimum_new_audio_ratio: crate::speech::engine::chunk_policy(self.model.engine)
                .minimum_new_audio_ratio,
        };
        let mut total_chunks =
            looper_ts::estimated_chunk_count(wav_info.total_samples, self.sample_rate, config)
                .max(1);
        let options = long_form_options(self, config);
        let reporter = ProgressReporter::new(self.app, self.state.storage(), &self.item.id);
        let transcript = transcriber.with_long_form_session(
            self.model,
            self.sample_rate,
            options,
            |session| {
                stream_wav_chunks(audio_path, config, |chunk| {
                    if self.token.is_cancelled() {
                        return Err(cancelled_error());
                    }
                    let update = session.process_chunk(chunk)?;
                    if self.token.is_cancelled() {
                        return Err(cancelled_error());
                    }

                    let remaining = wav_info
                        .total_samples
                        .saturating_sub(update.processed_samples);
                    total_chunks =
                        total_chunks.max(update.completed_chunks + u32::from(remaining > 0));
                    reporter.publish(progress_update(update, wav_info, total_chunks));
                    Ok(())
                })?;
                Ok(session.finish())
            },
        )?;
        Ok(LibraryTranscriptionResult {
            transcript: transcript.text,
            segments: transcript.segments.as_deref().map(convert_segments_to_ms),
            words: transcript.words.as_deref().map(convert_segments_to_ms),
            speech_model: None,
            speakers: None,
        })
    }
}

fn empty_transcription() -> LibraryTranscriptionResult {
    LibraryTranscriptionResult {
        transcript: String::new(),
        segments: None,
        words: None,
        speech_model: None,
        speakers: None,
    }
}

fn long_form_options(
    run: &LocalRun<'_>,
    chunking: looper_ts::LongFormConfig,
) -> looper_ts::LongFormOptions {
    let timestamps = if model_manager::model_supports_capability(
        &run.model.key,
        model_manager::MODEL_CAPABILITY_TIMESTAMPS,
    ) {
        looper_ts::TimestampMode::Word
    } else {
        looper_ts::TimestampMode::None
    };
    looper_ts::LongFormOptions {
        chunking,
        transcription: looper_ts::TranscribeOptions {
            language: Some(run.language.to_owned()),
            timestamps,
        },
        minimum_file_speech_ratio: 0.0,
        minimum_chunk_speech_ratio: VAD_MIN_SPEECH_PERCENT_CHUNK / 100.0,
        minimum_final_speech_ratio: VAD_MIN_SPEECH_PERCENT_CHUNK / 100.0,
        filter_by_speech_regions: false,
        merge: looper_ts::MergeOptions {
            lowercase_continuation: true,
        },
    }
}

fn progress_update(
    long_form: looper_ts::LongFormProgress,
    wav_info: &WavInfo,
    total_chunks: u32,
) -> LibraryProgressUpdate {
    let progress = (long_form.processed_samples as f32 / wav_info.total_samples as f32).min(1.0);
    let has_new_segments = !long_form.update.new_segments.is_empty();
    LibraryProgressUpdate {
        progress,
        current_chunk: long_form.completed_chunks,
        total_chunks,
        transcript: long_form
            .update
            .appended_text
            .as_ref()
            .map(|_| long_form.transcript.text.clone()),
        segments: has_new_segments
            .then(|| {
                long_form
                    .transcript
                    .segments
                    .as_deref()
                    .map(convert_segments_to_ms)
            })
            .flatten(),
        chunk_text: long_form.update.appended_text,
        chunk_segments: has_new_segments
            .then(|| convert_segments_to_ms(&long_form.update.new_segments)),
    }
}

#[cfg(test)]
mod tests {
    use super::super::types::MeetingTranscriptSource;
    use super::*;

    #[test]
    fn preparation_kind_preserves_import_task_identity_and_existing_audio_bypass() {
        let file = JobPreparation::from_kind(LibraryJobKind::Import {
            source_path: PathBuf::from("recording.wav"),
            store_original: true,
        })
        .expect("file imports need preparation");
        let youtube = JobPreparation::from_kind(LibraryJobKind::ImportYoutube {
            url: "https://youtube.example/watch?v=1".to_owned(),
            store_original: false,
        })
        .expect("YouTube imports need preparation");

        assert_eq!(file.task_name(), "Library import");
        assert_eq!(youtube.task_name(), "YouTube import");
        assert!(JobPreparation::from_kind(LibraryJobKind::TranscribeExisting).is_none());
    }

    #[test]
    fn active_or_cancelled_items_never_start_a_second_transcription() {
        assert!(!may_begin_transcription(&LibraryItemStatus::Transcribing {
            progress: 0.5,
        }));
        assert!(!may_begin_transcription(&LibraryItemStatus::Cancelling));
        assert!(!may_begin_transcription(&LibraryItemStatus::Cancelled));
        assert!(may_begin_transcription(&LibraryItemStatus::Pending));
        assert!(may_begin_transcription(&LibraryItemStatus::Importing {
            progress: 1.0,
        }));
    }

    #[test]
    fn live_meeting_transcript_is_a_complete_fallback_when_final_pass_is_empty() {
        let fallback = live_meeting_transcript_fallback(&[
            MeetingTranscriptSegment {
                id: "them-2".to_string(),
                source: MeetingTranscriptSource::Them,
                text: "Second decision.".to_string(),
                start_ms: 2_000,
                end_ms: 3_000,
            },
            MeetingTranscriptSegment {
                id: "blank".to_string(),
                source: MeetingTranscriptSource::You,
                text: "  ".to_string(),
                start_ms: 500,
                end_ms: 800,
            },
            MeetingTranscriptSegment {
                id: "you-1".to_string(),
                source: MeetingTranscriptSource::You,
                text: "First point.".to_string(),
                start_ms: 1_000,
                end_ms: 1_800,
            },
        ])
        .expect("persisted speech should produce a fallback");

        assert_eq!(fallback.transcript, "First point. Second decision.");
        assert_eq!(fallback.segments.len(), 2);
        assert_eq!(fallback.segments[0].speaker_id.as_deref(), Some("you"));
        assert_eq!(fallback.segments[1].speaker_id.as_deref(), Some("them"));
        assert_eq!(
            fallback
                .speakers
                .iter()
                .map(|speaker| speaker.id.as_str())
                .collect::<Vec<_>>(),
            vec!["you", "them"]
        );
    }

    #[test]
    fn empty_live_meeting_transcript_does_not_hide_a_real_no_speech_error() {
        assert!(live_meeting_transcript_fallback(&[]).is_none());
        assert!(
            live_meeting_transcript_fallback(&[MeetingTranscriptSegment {
                id: "blank".to_string(),
                source: MeetingTranscriptSource::You,
                text: "   ".to_string(),
                start_ms: 0,
                end_ms: 100,
            }])
            .is_none()
        );
    }
}
