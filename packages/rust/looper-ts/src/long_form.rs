use std::ops::Range;

use crate::{
    AudioInput, Engine, Error, TimedSegment, Transcript, TranscribeOptions, VadMode,
};

const MIN_OVERLAP_TOKENS: usize = 3;
const MAX_OVERLAP_TOKENS: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LongFormConfig {
    pub chunk_seconds: f32,
    pub overlap_seconds: f32,
    /// Minimum fraction of new audio retained before a quiet cut.
    pub minimum_new_audio_ratio: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LongFormOptions {
    pub chunking: LongFormConfig,
    pub transcription: TranscribeOptions,
    pub minimum_file_speech_ratio: f32,
    pub minimum_chunk_speech_ratio: f32,
    pub minimum_final_speech_ratio: f32,
    pub filter_by_speech_regions: bool,
    pub merge: MergeOptions,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct LongFormProgress {
    pub processed_samples: usize,
    pub completed_chunks: u32,
    pub transcript: Transcript,
    pub update: MergeUpdate,
}

impl LongFormConfig {
    pub fn chunk_samples(self, sample_rate: u32) -> usize {
        ((sample_rate.max(1) as f32 * self.chunk_seconds).round() as usize).max(1)
    }

    pub fn overlap_samples(self, sample_rate: u32) -> usize {
        ((sample_rate.max(1) as f32 * self.overlap_seconds).round() as usize)
            .min(self.chunk_samples(sample_rate).saturating_sub(1))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioChunk {
    pub start_sample: usize,
    pub samples: Vec<i16>,
    pub is_final: bool,
}

/// Incremental PCM chunker for bounded-memory long-form transcription.
///
/// Callers feed mono PCM in source order, drain ready chunks, then call
/// `finish` and drain the final partial chunk. The chunker owns overlap and
/// quiet-cut policy; callers retain only file decoding, cancellation and UI.
pub struct LongFormChunker {
    sample_rate: u32,
    chunk_samples: usize,
    overlap_samples: usize,
    minimum_new_audio_ratio: f32,
    buffer_start: usize,
    buffer: Vec<i16>,
    last_emitted_end: usize,
    finished: bool,
}

impl LongFormChunker {
    pub fn new(sample_rate: u32, config: LongFormConfig) -> crate::Result<Self> {
        if sample_rate == 0 {
            return Err(crate::Error::Validation(
                "long-form sample rate must be greater than zero".to_string(),
            ));
        }
        if !config.chunk_seconds.is_finite() || config.chunk_seconds <= 0.0 {
            return Err(crate::Error::Validation(
                "long-form chunk duration must be greater than zero".to_string(),
            ));
        }
        if !config.overlap_seconds.is_finite() || config.overlap_seconds < 0.0 {
            return Err(crate::Error::Validation(
                "long-form overlap duration cannot be negative".to_string(),
            ));
        }
        if !config.minimum_new_audio_ratio.is_finite()
            || !(0.0..=1.0).contains(&config.minimum_new_audio_ratio)
        {
            return Err(crate::Error::Validation(
                "minimum new-audio ratio must be between zero and one".to_string(),
            ));
        }

        Ok(Self {
            sample_rate,
            chunk_samples: config.chunk_samples(sample_rate),
            overlap_samples: config.overlap_samples(sample_rate),
            minimum_new_audio_ratio: config.minimum_new_audio_ratio,
            buffer_start: 0,
            buffer: Vec::new(),
            last_emitted_end: 0,
            finished: false,
        })
    }

    pub fn preferred_input_samples(&self) -> usize {
        self.chunk_samples.saturating_sub(self.buffer.len()).max(1)
    }

    pub fn push(&mut self, samples: &[i16]) -> crate::Result<()> {
        if self.finished {
            return Err(crate::Error::Validation(
                "cannot push audio after finishing a long-form stream".to_string(),
            ));
        }
        self.buffer.extend_from_slice(samples);
        Ok(())
    }

    pub fn finish(&mut self) {
        self.finished = true;
    }

    pub fn next_chunk(&mut self) -> Option<AudioChunk> {
        let ready = self.buffer.len() >= self.chunk_samples;
        let has_unemitted_audio =
            self.buffer_start.saturating_add(self.buffer.len()) > self.last_emitted_end;
        if !ready && !(self.finished && has_unemitted_audio) {
            return None;
        }

        let window = ChunkWindowPolicy {
            sample_rate: self.sample_rate,
            chunk_samples: self.chunk_samples,
            overlap_samples: self.overlap_samples,
            minimum_new_audio_ratio: self.minimum_new_audio_ratio,
        };
        let (final_chunk, end) = window.select(&self.buffer, self.finished);
        let start_sample = self.buffer_start;
        let emitted_end = start_sample.saturating_add(end);
        let samples = self.buffer[..end].to_vec();
        self.last_emitted_end = self.last_emitted_end.max(emitted_end);

        if final_chunk {
            self.buffer.clear();
            self.buffer_start = emitted_end;
        } else {
            let advance = end.saturating_sub(self.overlap_samples).max(1);
            self.buffer.drain(..advance);
            self.buffer_start = self.buffer_start.saturating_add(advance);
        }

        Some(AudioChunk {
            start_sample,
            samples,
            is_final: final_chunk,
        })
    }
}

#[derive(Debug, Clone, Copy)]
struct ChunkWindowPolicy {
    sample_rate: u32,
    chunk_samples: usize,
    overlap_samples: usize,
    minimum_new_audio_ratio: f32,
}

impl ChunkWindowPolicy {
    fn select(self, buffer: &[i16], finished: bool) -> (bool, usize) {
        let final_chunk = finished && buffer.len() <= self.chunk_samples;
        let nominal_end = buffer.len().min(self.chunk_samples);
        if final_chunk {
            return (true, nominal_end);
        }

        let minimum_new = ((self.chunk_samples.saturating_sub(self.overlap_samples) as f32
            * self.minimum_new_audio_ratio)
            .ceil() as usize)
            .saturating_add(self.overlap_samples)
            .min(nominal_end);
        let quiet_cut = crate::vad::quiet_cut_index(&buffer[..nominal_end], self.sample_rate);
        (false, quiet_cut.max(minimum_new).min(nominal_end))
    }
}

impl Engine {
    pub fn long_form_session(
        &mut self,
        sample_rate: u32,
        options: LongFormOptions,
    ) -> crate::Result<LongFormSession<'_>> {
        LongFormSession::new(self, sample_rate, options)
    }

    /// Runs the complete in-memory long-form pipeline.
    ///
    /// Cancellation is observed between chunks; backend inference itself is
    /// synchronous. Progress receives source-relative merged snapshots.
    pub fn transcribe_long<F, C>(
        &mut self,
        input: AudioInput,
        options: &LongFormOptions,
        mut on_progress: F,
        is_cancelled: C,
    ) -> crate::Result<Transcript>
    where
        F: FnMut(LongFormProgress),
        C: Fn() -> bool,
    {
        let (samples, sample_rate) = into_pcm_i16(input)?;
        validate_ratio(
            options.minimum_file_speech_ratio,
            "minimum file speech ratio",
        )?;
        validate_ratio(
            options.minimum_chunk_speech_ratio,
            "minimum chunk speech ratio",
        )?;
        validate_ratio(
            options.minimum_final_speech_ratio,
            "minimum final speech ratio",
        )?;
        if samples.is_empty() {
            return Ok(Transcript::default());
        }
        if crate::vad::speech_ratio(&samples, sample_rate, VadMode::VeryAggressive)?
            < options.minimum_file_speech_ratio
        {
            return Ok(Transcript {
                duration_ms: samples.len() as u128 * 1_000 / sample_rate as u128,
                ..Transcript::default()
            });
        }

        let mut chunker = LongFormChunker::new(sample_rate, options.chunking)?;
        let mut session = self.long_form_session(sample_rate, options.clone())?;
        let mut cursor = 0usize;

        loop {
            if is_cancelled() {
                return Err(Error::Cancelled("long-form transcription".to_string()));
            }
            if cursor < samples.len() {
                let take = chunker
                    .preferred_input_samples()
                    .min(samples.len() - cursor);
                chunker.push(&samples[cursor..cursor + take])?;
                cursor += take;
            }
            if cursor == samples.len() {
                chunker.finish();
            }

            while let Some(chunk) = chunker.next_chunk() {
                if is_cancelled() {
                    return Err(Error::Cancelled("long-form transcription".to_string()));
                }
                let mut progress = session.process_chunk(&chunk)?;
                progress.processed_samples = progress.processed_samples.min(samples.len());
                on_progress(progress);
                if is_cancelled() {
                    return Err(Error::Cancelled("long-form transcription".to_string()));
                }
            }

            if cursor == samples.len() && chunker.next_chunk().is_none() {
                break;
            }
        }

        Ok(session.finish())
    }
}

/// Turns one chunk of audio into a transcript.
///
/// All a long-form run needs from a model. Depending on this rather than on
/// [`Engine`] keeps the chunking, speech-gating and merging decisions testable
/// without a downloaded model behind them.
pub trait ChunkTranscriber {
    fn transcribe_chunk(
        &mut self,
        samples: &[i16],
        sample_rate: u32,
        options: &TranscribeOptions,
    ) -> crate::Result<Transcript>;
}

impl ChunkTranscriber for Engine {
    fn transcribe_chunk(
        &mut self,
        samples: &[i16],
        sample_rate: u32,
        options: &TranscribeOptions,
    ) -> crate::Result<Transcript> {
        self.transcribe(
            AudioInput::PcmI16 {
                samples: samples.to_vec(),
                sample_rate,
            },
            options,
        )
    }
}

pub struct LongFormSession<'a, T: ChunkTranscriber + ?Sized = Engine> {
    engine: &'a mut T,
    sample_rate: u32,
    options: LongFormOptions,
    merger: TranscriptMerger,
    completed_chunks: u32,
}

impl<'a, T: ChunkTranscriber + ?Sized> LongFormSession<'a, T> {
    fn new(
        engine: &'a mut T,
        sample_rate: u32,
        options: LongFormOptions,
    ) -> crate::Result<Self> {
        if sample_rate == 0 {
            return Err(Error::Validation(
                "long-form sample rate must be greater than zero".to_string(),
            ));
        }
        validate_ratio(
            options.minimum_chunk_speech_ratio,
            "minimum chunk speech ratio",
        )?;
        validate_ratio(
            options.minimum_final_speech_ratio,
            "minimum final speech ratio",
        )?;
        Ok(Self {
            engine,
            sample_rate,
            options,
            merger: TranscriptMerger::default(),
            completed_chunks: 0,
        })
    }

    pub fn process_chunk(&mut self, chunk: &AudioChunk) -> crate::Result<LongFormProgress> {
        self.completed_chunks = self.completed_chunks.saturating_add(1);
        let threshold = if chunk.is_final {
            self.options.minimum_final_speech_ratio
        } else {
            self.options.minimum_chunk_speech_ratio
        };
        let mut update = MergeUpdate::default();
        self.merger.observe_audio(
            chunk.start_sample,
            chunk.samples.len(),
            self.sample_rate,
        );
        if crate::vad::speech_ratio(
            &chunk.samples,
            self.sample_rate,
            VadMode::VeryAggressive,
        )? >= threshold
        {
            let mut transcript = self.engine.transcribe_chunk(
                &chunk.samples,
                self.sample_rate,
                &self.options.transcription,
            )?;
            transcript.text = normalize_chunk_text(&transcript.text);
            if self.options.filter_by_speech_regions {
                let regions = crate::vad::speech_regions(&chunk.samples, self.sample_rate);
                transcript.text = filter_spoken_segments(
                    &transcript.text,
                    transcript.segments.as_deref(),
                    regions.as_deref(),
                );
            }
            update = self.merger.merge(
                chunk.start_sample,
                self.sample_rate,
                transcript,
                self.options.merge,
            );
        }

        Ok(LongFormProgress {
            processed_samples: chunk.start_sample.saturating_add(chunk.samples.len()),
            completed_chunks: self.completed_chunks,
            transcript: self.merger.snapshot(),
            update,
        })
    }

    pub fn finish(&mut self) -> Transcript {
        std::mem::take(&mut self.merger).into_transcript()
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct MergeOptions {
    pub lowercase_continuation: bool,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct MergeUpdate {
    pub appended_text: Option<String>,
    pub new_segments: Vec<TimedSegment>,
}

#[derive(Debug, Default)]
pub struct TranscriptMerger {
    text: String,
    segments: Vec<TimedSegment>,
    words: Vec<TimedSegment>,
    last_segment_end: f32,
    last_word_end: f32,
    duration_ms: u128,
}

impl TranscriptMerger {
    fn observe_audio(&mut self, start_sample: usize, sample_count: usize, sample_rate: u32) {
        self.duration_ms = self.duration_ms.max(
            start_sample.saturating_add(sample_count) as u128 * 1_000 / sample_rate.max(1) as u128,
        );
    }

    pub fn merge(
        &mut self,
        chunk_start_sample: usize,
        sample_rate: u32,
        chunk: Transcript,
        options: MergeOptions,
    ) -> MergeUpdate {
        let offset_seconds = chunk_start_sample as f32 / sample_rate.max(1) as f32;
        self.duration_ms = self
            .duration_ms
            .max((offset_seconds * 1000.0).round() as u128 + chunk.duration_ms);

        let mut kept_words = 0usize;
        let mut appended_text = None;
        let chunk_text = chunk.text;
        if !chunk_text.trim().is_empty() {
            let mut deduped = dedupe_overlap_text(&self.text, &chunk_text);
            if options.lowercase_continuation && !ends_sentence(&self.text) {
                lowercase_first_alpha(&mut deduped);
            }
            if !deduped.trim().is_empty() {
                kept_words = deduped.split_whitespace().count();
                append_text(&mut self.text, &deduped);
                appended_text = Some(deduped);
            }
        }

        let mut new_segments = Vec::new();
        for mut segment in chunk.segments.unwrap_or_default() {
            segment.start += offset_seconds;
            segment.end += offset_seconds;
            if segment.end <= self.last_segment_end {
                continue;
            }
            self.last_segment_end = segment.end;
            self.segments.push(segment.clone());
            new_segments.push(segment);
        }

        let words = chunk.words.unwrap_or_default();
        let exact_skip = (chunk_text.split_whitespace().count() == words.len())
            .then(|| words.len().saturating_sub(kept_words));
        let chunk_word_floor = self.last_word_end;
        for (index, mut word) in words.into_iter().enumerate() {
            word.start += offset_seconds;
            word.end += offset_seconds;
            if matches!(exact_skip, Some(skip) if index < skip) || word.end <= chunk_word_floor {
                continue;
            }
            self.last_word_end = self.last_word_end.max(word.end);
            self.words.push(word);
        }

        MergeUpdate {
            appended_text,
            new_segments,
        }
    }

    pub fn transcript(&self) -> &str {
        self.text.trim()
    }

    pub fn segments(&self) -> &[TimedSegment] {
        &self.segments
    }

    pub fn snapshot(&self) -> Transcript {
        Transcript {
            text: self.text.trim().to_string(),
            duration_ms: self.duration_ms,
            segments: (!self.segments.is_empty()).then(|| self.segments.clone()),
            words: (!self.words.is_empty()).then(|| self.words.clone()),
        }
    }

    pub fn into_transcript(self) -> Transcript {
        Transcript {
            text: self.text.trim().to_string(),
            duration_ms: self.duration_ms,
            segments: (!self.segments.is_empty()).then_some(self.segments),
            words: (!self.words.is_empty()).then_some(self.words),
        }
    }
}

fn into_pcm_i16(input: AudioInput) -> crate::Result<(Vec<i16>, u32)> {
    match input {
        AudioInput::PcmI16 {
            samples,
            sample_rate,
        } if sample_rate > 0 => Ok((samples, sample_rate)),
        AudioInput::PcmF32 {
            samples,
            sample_rate,
        } if sample_rate > 0 => {
            if samples.iter().any(|sample| !sample.is_finite()) {
                return Err(Error::Validation(
                    "PCM samples must contain only finite values".to_string(),
                ));
            }
            Ok((
                samples
                    .into_iter()
                    .map(|sample| {
                        (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
                    })
                    .collect(),
                sample_rate,
            ))
        }
        _ => Err(Error::Validation(
            "long-form sample rate must be greater than zero".to_string(),
        )),
    }
}

fn validate_ratio(value: f32, label: &str) -> crate::Result<()> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(Error::Validation(format!(
            "{label} must be between zero and one"
        )))
    }
}

fn normalize_chunk_text(input: &str) -> String {
    input
        .lines()
        .map(|line| {
            let mut normalized = String::with_capacity(line.len());
            let mut had_space = false;
            for character in line.chars() {
                if matches!(character, ' ' | '\t') {
                    if !normalized.is_empty() && !had_space {
                        normalized.push(' ');
                    }
                    had_space = true;
                } else {
                    normalized.push(character);
                    had_space = false;
                }
            }
            normalized.trim_end().to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn dedupe_overlap_text(existing: &str, next: &str) -> String {
    let existing_trim = existing.trim_end();
    let next_trim = next.trim();
    if existing_trim.is_empty() {
        return next_trim.to_string();
    }

    if let Some(drop_index) = find_overlap_drop_index(existing_trim, next) {
        if drop_index >= next.len() {
            return String::new();
        }
        return next[drop_index..].trim_start().to_string();
    }

    let existing_tail = last_chars(existing_trim, 120);
    if !existing_tail.is_empty() && next_trim.starts_with(&existing_tail) {
        return next_trim[existing_tail.len()..].trim_start().to_string();
    }

    next_trim.to_string()
}

pub fn filter_spoken_segments(
    transcript: &str,
    segments: Option<&[TimedSegment]>,
    regions: Option<&[(f32, f32)]>,
) -> String {
    let (Some(segments), Some(regions)) = (segments, regions) else {
        return transcript.trim().to_string();
    };
    if regions.is_empty() {
        return String::new();
    }
    segments
        .iter()
        .filter(|segment| {
            regions
                .iter()
                .any(|&(start, end)| segment.start < end && segment.end > start)
        })
        .map(|segment| segment.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn estimated_chunk_count(
    total_samples: usize,
    sample_rate: u32,
    config: LongFormConfig,
) -> u32 {
    if total_samples == 0 {
        return 0;
    }
    let chunk_samples = config.chunk_samples(sample_rate);
    let step = chunk_samples
        .saturating_sub(config.overlap_samples(sample_rate))
        .max(1);
    1 + total_samples
        .saturating_sub(chunk_samples)
        .div_ceil(step)
        .min(u32::MAX as usize) as u32
}

fn append_text(existing: &mut String, next: &str) {
    let next = next.trim();
    if next.is_empty() {
        return;
    }
    if !existing.is_empty() {
        existing.push(' ');
    }
    existing.push_str(next);
}

fn ends_sentence(text: &str) -> bool {
    text.chars()
        .rev()
        .find(|character| !character.is_whitespace())
        .map(|character| matches!(character, '.' | '!' | '?' | ':' | ';'))
        .unwrap_or(true)
}

fn lowercase_first_alpha(text: &mut String) {
    if let Some((index, character)) = text.char_indices().find(|(_, ch)| ch.is_alphabetic()) {
        if character.is_uppercase() {
            let mut lowered = String::with_capacity(text.len());
            lowered.push_str(&text[..index]);
            lowered.extend(character.to_lowercase());
            lowered.push_str(&text[index + character.len_utf8()..]);
            *text = lowered;
        }
    }
}

#[derive(Debug, Clone)]
struct TokenOffset {
    normalized: String,
    range: Range<usize>,
}

fn find_overlap_drop_index(existing: &str, next: &str) -> Option<usize> {
    let existing_tokens = tokenize_with_offsets(existing);
    let next_tokens = tokenize_with_offsets(next);
    let max_overlap = existing_tokens
        .len()
        .min(next_tokens.len())
        .min(MAX_OVERLAP_TOKENS);
    if max_overlap < MIN_OVERLAP_TOKENS {
        return None;
    }

    for overlap in (MIN_OVERLAP_TOKENS..=max_overlap).rev() {
        let existing_start = existing_tokens.len() - overlap;
        let matches = existing_tokens[existing_start..]
            .iter()
            .zip(&next_tokens[..overlap])
            .all(|(left, right)| left.normalized == right.normalized);
        if matches {
            return Some(
                next_tokens
                    .get(overlap)
                    .map(|token| token.range.start)
                    .unwrap_or(next.len()),
            );
        }
    }
    None
}

fn tokenize_with_offsets(text: &str) -> Vec<TokenOffset> {
    let mut tokens = Vec::new();
    let mut normalized = String::new();
    let mut start = 0usize;
    let mut in_token = false;

    for (index, character) in text.char_indices() {
        if character.is_alphanumeric() {
            if !in_token {
                in_token = true;
                start = index;
                normalized.clear();
            }
            normalized.extend(character.to_lowercase());
        } else if in_token {
            tokens.push(TokenOffset {
                normalized: normalized.clone(),
                range: start..index,
            });
            in_token = false;
        }
    }
    if in_token {
        tokens.push(TokenOffset {
            normalized,
            range: start..text.len(),
        });
    }
    tokens
}

fn last_chars(value: &str, count: usize) -> String {
    let mut characters: Vec<char> = value.chars().collect();
    if characters.len() <= count {
        return value.to_string();
    }
    characters.drain(..characters.len() - count);
    characters.into_iter().collect()
}

#[cfg(test)]
mod session_tests {
    use super::*;

    /// A model that returns canned text, so a test can drive the chunking,
    /// speech-gating and merging decisions without ONNX weights.
    struct ScriptedModel {
        replies: Vec<&'static str>,
        seen: Vec<usize>,
    }

    impl ScriptedModel {
        fn new(replies: Vec<&'static str>) -> Self {
            Self {
                replies,
                seen: Vec::new(),
            }
        }
    }

    impl ChunkTranscriber for ScriptedModel {
        fn transcribe_chunk(
            &mut self,
            samples: &[i16],
            _sample_rate: u32,
            _options: &TranscribeOptions,
        ) -> crate::Result<Transcript> {
            self.seen.push(samples.len());
            let index = self.seen.len() - 1;
            Ok(Transcript {
                text: self.replies.get(index).copied().unwrap_or("").to_string(),
                ..Transcript::default()
            })
        }
    }

    const RATE: u32 = 16_000;

    fn options(minimum_chunk_speech_ratio: f32) -> LongFormOptions {
        LongFormOptions {
            chunking: LongFormConfig {
                chunk_seconds: 1.0,
                overlap_seconds: 0.1,
                minimum_new_audio_ratio: 0.5,
            },
            transcription: TranscribeOptions::default(),
            minimum_file_speech_ratio: 0.0,
            minimum_chunk_speech_ratio,
            minimum_final_speech_ratio: minimum_chunk_speech_ratio,
            filter_by_speech_regions: false,
            merge: MergeOptions::default(),
        }
    }

    fn loud_chunk(start: usize, len: usize, is_final: bool) -> AudioChunk {
        // A square wave reads as speech to the detector.
        let samples = (0..len)
            .map(|i| if (i / 40) % 2 == 0 { 8_000 } else { -8_000 })
            .collect();
        AudioChunk {
            start_sample: start,
            samples,
            is_final,
        }
    }

    fn silent_chunk(start: usize, len: usize, is_final: bool) -> AudioChunk {
        AudioChunk {
            start_sample: start,
            samples: vec![0; len],
            is_final,
        }
    }

    #[test]
    fn a_chunk_with_speech_reaches_the_model() {
        let mut model = ScriptedModel::new(vec!["hello there"]);
        let mut session = LongFormSession::new(&mut model, RATE, options(0.0)).unwrap();

        let progress = session.process_chunk(&loud_chunk(0, RATE as usize, true)).unwrap();

        assert_eq!(progress.completed_chunks, 1);
        assert!(progress.transcript.text.contains("hello there"));
        assert_eq!(model.seen.len(), 1, "the model should have been asked once");
    }

    #[test]
    fn silence_never_reaches_the_model() {
        let mut model = ScriptedModel::new(vec!["should not appear"]);
        let mut session = LongFormSession::new(&mut model, RATE, options(0.9)).unwrap();

        let progress = session.process_chunk(&silent_chunk(0, RATE as usize, true)).unwrap();

        assert!(model.seen.is_empty(), "silence must not be transcribed");
        assert!(progress.transcript.text.is_empty());
        assert_eq!(
            progress.completed_chunks, 1,
            "a skipped chunk still counts as processed"
        );
    }

    #[test]
    fn consecutive_chunks_are_merged_in_order() {
        let mut model = ScriptedModel::new(vec!["first part", "second part"]);
        let mut session = LongFormSession::new(&mut model, RATE, options(0.0)).unwrap();

        session.process_chunk(&loud_chunk(0, RATE as usize, false)).unwrap();
        session
            .process_chunk(&loud_chunk(RATE as usize, RATE as usize, true))
            .unwrap();

        let transcript = session.finish();
        assert!(transcript.text.contains("first part"));
        assert!(transcript.text.contains("second part"));
        assert!(
            transcript.text.find("first").unwrap() < transcript.text.find("second").unwrap(),
            "chunks must merge in source order"
        );
    }

    #[test]
    fn progress_tracks_position_through_the_source() {
        let mut model = ScriptedModel::new(vec!["a", "b"]);
        let mut session = LongFormSession::new(&mut model, RATE, options(0.0)).unwrap();

        let first = session.process_chunk(&loud_chunk(0, 8_000, false)).unwrap();
        let second = session.process_chunk(&loud_chunk(8_000, 8_000, true)).unwrap();

        assert_eq!(first.processed_samples, 8_000);
        assert_eq!(second.processed_samples, 16_000);
        assert_eq!(second.completed_chunks, 2);
    }

    #[test]
    fn a_zero_sample_rate_is_refused() {
        let mut model = ScriptedModel::new(vec![]);
        assert!(LongFormSession::new(&mut model, 0, options(0.0)).is_err());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> LongFormConfig {
        LongFormConfig {
            chunk_seconds: 1.0,
            overlap_seconds: 0.2,
            minimum_new_audio_ratio: 0.5,
        }
    }

    #[test]
    fn incremental_chunking_preserves_overlap_without_reemitting_final_carry() {
        let mut chunker = LongFormChunker::new(1_000, config()).unwrap();
        chunker.push(&vec![10; 1_000]).unwrap();
        let first = chunker.next_chunk().unwrap();
        assert_eq!(first.start_sample, 0);
        assert_eq!(first.samples.len(), 1_000);
        assert!(!first.is_final);

        chunker.push(&vec![20; 700]).unwrap();
        chunker.finish();
        let final_chunk = chunker.next_chunk().unwrap();
        assert_eq!(final_chunk.start_sample, 800);
        assert_eq!(final_chunk.samples.len(), 900);
        assert!(final_chunk.is_final);
        assert!(chunker.next_chunk().is_none());
    }

    #[test]
    fn finishing_without_new_audio_does_not_emit_overlap_twice() {
        let mut chunker = LongFormChunker::new(1_000, config()).unwrap();
        chunker.push(&vec![10; 1_000]).unwrap();
        assert!(chunker.next_chunk().is_some());
        chunker.finish();
        assert!(chunker.next_chunk().is_none());
    }

    #[test]
    fn overlap_deduplication_is_case_and_punctuation_insensitive() {
        assert_eq!(
            dedupe_overlap_text(
                "Uno dos tres, cuatro cinco.",
                "TRES cuatro cinco; seis siete"
            ),
            "seis siete"
        );
    }

    #[test]
    fn merger_offsets_timestamps_and_discards_overlapped_words() {
        let mut merger = TranscriptMerger::default();
        merger.merge(
            0,
            1_000,
            Transcript {
                text: "one two three four".to_string(),
                duration_ms: 1_000,
                words: Some(vec![TimedSegment {
                    start: 0.8,
                    end: 1.0,
                    text: "four".to_string(),
                }]),
                ..Transcript::default()
            },
            MergeOptions::default(),
        );
        merger.merge(
            800,
            1_000,
            Transcript {
                text: "two three four five".to_string(),
                duration_ms: 1_000,
                words: Some(vec![
                    TimedSegment {
                        start: 0.0,
                        end: 0.2,
                        text: "two".to_string(),
                    },
                    TimedSegment {
                        start: 0.2,
                        end: 0.4,
                        text: "three".to_string(),
                    },
                    TimedSegment {
                        start: 0.4,
                        end: 0.6,
                        text: "four".to_string(),
                    },
                    TimedSegment {
                        start: 0.6,
                        end: 0.8,
                        text: "five".to_string(),
                    },
                ]),
                ..Transcript::default()
            },
            MergeOptions::default(),
        );

        let transcript = merger.into_transcript();
        assert_eq!(transcript.text, "one two three four five");
        assert_eq!(transcript.words.unwrap().last().unwrap().text, "five");
    }

    #[test]
    fn spoken_segment_filter_is_owned_by_long_form_policy() {
        let segments = vec![
            TimedSegment {
                start: 0.0,
                end: 0.5,
                text: "hallucination".to_string(),
            },
            TimedSegment {
                start: 1.0,
                end: 1.5,
                text: "spoken".to_string(),
            },
        ];
        assert_eq!(
            filter_spoken_segments("hallucination spoken", Some(&segments), Some(&[(0.9, 1.6)])),
            "spoken"
        );
    }
}
