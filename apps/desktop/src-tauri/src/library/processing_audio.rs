use std::{
    fs,
    io::{BufReader, BufWriter, ErrorKind},
    path::Path,
};

use anyhow::{anyhow, Context, Result};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    errors::Error as SymphoniaError,
    formats::{probe::Hint, FormatOptions, TrackType},
    io::MediaSourceStream,
    meta::MetadataOptions,
    packet::Packet,
    units::TimeBase,
};
use tokio_util::sync::CancellationToken;

use super::processing_tools;
use crate::library::types::{
    cancelled_error, is_cancelled_error, SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS,
    TARGET_SAMPLE_RATE,
};

pub(crate) struct WavInfo {
    pub sample_rate: u32,
    pub total_samples: usize,
    pub duration_seconds: f32,
}

pub(crate) fn read_wav_info(path: &Path) -> Result<WavInfo> {
    let file = fs::File::open(path)
        .with_context(|| format!("Failed to open WAV file at {}", path.display()))?;
    let reader = hound::WavReader::new(BufReader::new(file))
        .map_err(|error| anyhow!("WAV read error: {error}"))?;
    let sample_rate = reader.spec().sample_rate;
    if sample_rate == 0 {
        return Err(anyhow!("Invalid sample rate"));
    }
    let total_samples = reader.duration() as usize;
    Ok(WavInfo {
        sample_rate,
        total_samples,
        duration_seconds: total_samples as f32 / sample_rate as f32,
    })
}

pub(crate) fn stream_wav_chunks<F>(
    path: &Path,
    config: looper_ts::LongFormConfig,
    on_chunk: F,
) -> Result<()>
where
    F: FnMut(&looper_ts::AudioChunk) -> Result<()>,
{
    WavChunkStream::open(path, config)?.consume(on_chunk)
}

struct WavChunkStream {
    reader: hound::WavReader<BufReader<fs::File>>,
    channels: usize,
    chunker: looper_ts::LongFormChunker,
    interleaved: Vec<i16>,
    mono: Vec<i16>,
}

impl WavChunkStream {
    fn open(path: &Path, config: looper_ts::LongFormConfig) -> Result<Self> {
        let file = fs::File::open(path)
            .with_context(|| format!("Failed to open WAV file at {}", path.display()))?;
        let reader = hound::WavReader::new(BufReader::new(file))
            .map_err(|error| anyhow!("WAV read error: {error}"))?;
        validate_stream_spec(reader.spec())?;
        let sample_rate = reader.spec().sample_rate;
        let channels = usize::from(reader.spec().channels.max(1));
        let chunker = looper_ts::LongFormChunker::new(sample_rate, config)?;
        let mono_capacity = config.chunk_samples(sample_rate);
        let preferred = mono_capacity.saturating_mul(channels);
        Ok(Self {
            reader,
            channels,
            chunker,
            interleaved: Vec::with_capacity(preferred),
            mono: Vec::with_capacity(mono_capacity),
        })
    }

    fn consume(
        mut self,
        mut on_chunk: impl FnMut(&looper_ts::AudioChunk) -> Result<()>,
    ) -> Result<()> {
        let mut samples = self.reader.samples::<i16>();
        loop {
            self.interleaved.clear();
            let requested = self
                .chunker
                .preferred_input_samples()
                .saturating_mul(self.channels);
            for _ in 0..requested {
                match samples.next() {
                    Some(Ok(sample)) => self.interleaved.push(sample),
                    Some(Err(error)) => return Err(anyhow!("WAV read error: {error}")),
                    None => break,
                }
            }

            let reached_end = self.interleaved.len() < requested;
            if self.interleaved.len() / self.channels == 0 {
                self.chunker.finish();
                emit_ready_chunks(&mut self.chunker, &mut on_chunk)?;
                break;
            }

            downmix_i16(&self.interleaved, self.channels, &mut self.mono);
            self.chunker.push(&self.mono)?;
            if reached_end {
                self.chunker.finish();
            }
            emit_ready_chunks(&mut self.chunker, &mut on_chunk)?;
            if reached_end {
                break;
            }
        }
        Ok(())
    }
}

fn validate_stream_spec(spec: hound::WavSpec) -> Result<()> {
    if spec.sample_format != hound::SampleFormat::Int {
        return Err(anyhow!("Unsupported WAV sample format"));
    }
    if spec.bits_per_sample != 16 {
        return Err(anyhow!(
            "Unsupported WAV bits per sample: {}",
            spec.bits_per_sample
        ));
    }
    if spec.sample_rate == 0 {
        return Err(anyhow!("Invalid sample rate"));
    }
    Ok(())
}

fn emit_ready_chunks(
    chunker: &mut looper_ts::LongFormChunker,
    on_chunk: &mut impl FnMut(&looper_ts::AudioChunk) -> Result<()>,
) -> Result<()> {
    while let Some(chunk) = chunker.next_chunk() {
        on_chunk(&chunk)?;
    }
    Ok(())
}

fn downmix_i16(input: &[i16], channels: usize, output: &mut Vec<i16>) {
    output.clear();
    if channels <= 1 {
        output.extend_from_slice(input);
        return;
    }
    output.reserve(input.len() / channels);
    for frame in input.chunks_exact(channels) {
        let total = frame.iter().map(|sample| i32::from(*sample)).sum::<i32>();
        output.push((total / channels as i32) as i16);
    }
}

pub(crate) fn convert_to_wav(
    input: &Path,
    output: &Path,
    extension: &str,
    token: Option<&CancellationToken>,
    duration_ms: Option<u64>,
    progress: Option<&mut dyn FnMut(f32)>,
) -> Result<()> {
    if SUPPORTED_AUDIO_FORMATS.contains(&extension) {
        convert_audio(input, output, token, duration_ms, progress)
    } else if SUPPORTED_VIDEO_FORMATS.contains(&extension) {
        convert_video(input, output, token, duration_ms, progress)
    } else {
        Err(anyhow!("Unsupported file format: {extension}"))
    }
}

fn convert_audio(
    input: &Path,
    output: &Path,
    token: Option<&CancellationToken>,
    duration_ms: Option<u64>,
    mut progress: Option<&mut dyn FnMut(f32)>,
) -> Result<()> {
    let wav_input = input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("wav"));
    if wav_input && copy_compatible_wav(input, output)? {
        return Ok(());
    }

    if let Some(ffmpeg) = super::find_ffmpeg_in_path() {
        let attempt = match progress.as_mut() {
            Some(callback) => processing_tools::convert_with_ffmpeg(
                &ffmpeg,
                input,
                output,
                token,
                duration_ms,
                Some(&mut **callback),
            ),
            None => processing_tools::convert_with_ffmpeg(
                &ffmpeg,
                input,
                output,
                token,
                duration_ms,
                None,
            ),
        };
        match attempt {
            Ok(()) => return Ok(()),
            Err(error) => {
                remove_partial(output);
                if is_cancelled_error(&error) {
                    return Err(error);
                }
            }
        }
    }

    let decoded = match progress.as_mut() {
        Some(callback) => decode_audio(input, output, token, duration_ms, Some(&mut **callback)),
        None => decode_audio(input, output, token, duration_ms, None),
    };
    match decoded {
        Ok(()) => Ok(()),
        Err(error) => {
            remove_partial(output);
            if is_cancelled_error(&error) {
                Err(error)
            } else {
                Err(anyhow!(
                    "Audio decode failed: {error}. Install ffmpeg to import this file."
                ))
            }
        }
    }
}

fn copy_compatible_wav(input: &Path, output: &Path) -> Result<bool> {
    let file = fs::File::open(input)
        .with_context(|| format!("Failed to open WAV file at {}", input.display()))?;
    let reader = match hound::WavReader::new(file) {
        Ok(reader) => reader,
        Err(_) => return Ok(false),
    };
    let spec = reader.spec();
    let compatible = spec.sample_rate == TARGET_SAMPLE_RATE
        && spec.channels == 1
        && spec.bits_per_sample == 16
        && spec.sample_format == hound::SampleFormat::Int;
    if !compatible {
        return Ok(false);
    }
    drop(reader);
    fs::copy(input, output).with_context(|| {
        format!(
            "Failed to copy WAV file from {} to {}",
            input.display(),
            output.display()
        )
    })?;
    Ok(true)
}

fn convert_video(
    input: &Path,
    output: &Path,
    token: Option<&CancellationToken>,
    duration_ms: Option<u64>,
    progress: Option<&mut dyn FnMut(f32)>,
) -> Result<()> {
    let ffmpeg = super::find_ffmpeg_in_path().ok_or_else(|| {
        anyhow!(
            "FFmpeg is required to import video files. Install ffmpeg and ensure it is on your PATH."
        )
    })?;
    processing_tools::convert_with_ffmpeg(&ffmpeg, input, output, token, duration_ms, progress)
}

fn remove_partial(path: &Path) {
    let _ = fs::remove_file(path);
}

fn decode_audio(
    input: &Path,
    output: &Path,
    token: Option<&CancellationToken>,
    duration_ms: Option<u64>,
    mut progress: Option<&mut dyn FnMut(f32)>,
) -> Result<()> {
    let file = fs::File::open(input)
        .with_context(|| format!("Failed to open audio file at {}", input.display()))?;
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = input.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|error| anyhow!("Failed to read audio container: {error}"))?;
    let track = format
        .default_track(TrackType::Audio)
        .or_else(|| {
            format.tracks().iter().find(|track| {
                track
                    .codec_params
                    .as_ref()
                    .and_then(|parameters| parameters.audio())
                    .is_some_and(|audio| audio.sample_rate.is_some() && audio.channels.is_some())
            })
        })
        .ok_or_else(|| anyhow!("No supported audio tracks found"))?;
    let parameters = track
        .codec_params
        .as_ref()
        .and_then(|parameters| parameters.audio())
        .ok_or_else(|| anyhow!("Track is not an audio track"))?;
    let sample_rate = parameters
        .sample_rate
        .ok_or_else(|| anyhow!("Unknown sample rate"))?;
    if sample_rate == 0 {
        return Err(anyhow!("Invalid sample rate"));
    }
    let channels = parameters
        .channels
        .as_ref()
        .ok_or_else(|| anyhow!("Unknown channel count"))?
        .count();
    if channels == 0 {
        return Err(anyhow!("Unknown channel count"));
    }

    let track_id = track.id;
    let mut meter = DecodeProgress::new(track.num_frames, track.time_base, duration_ms);
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(parameters, &AudioDecoderOptions::default())
        .map_err(|error| anyhow!("Unsupported audio codec: {error}"))?;
    let mut sink = MonoWavSink::create(output)?;
    let mut resampler = (sample_rate != TARGET_SAMPLE_RATE)
        .then(|| LinearResampler::new(sample_rate, TARGET_SAMPLE_RATE));
    let mut interleaved = Vec::new();
    let mut mono = Vec::new();
    let mut resampled = Vec::new();

    loop {
        if token.is_some_and(CancellationToken::is_cancelled) {
            return Err(cancelled_error());
        }
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(error) => return Err(anyhow!("Audio packet read failed: {error}")),
        };
        if packet.track_id != track_id {
            continue;
        }
        if let Some(callback) = progress.as_deref_mut() {
            meter.observe(&packet, callback);
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::IoError(error)) if error.kind() == ErrorKind::UnexpectedEof => {
                break
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(error) => return Err(anyhow!("Audio decode failed: {error}")),
        };
        decoded.copy_to_vec_interleaved(&mut interleaved);
        downmix_f32(&interleaved, channels, &mut mono);
        if mono.is_empty() {
            continue;
        }
        if let Some(active) = &mut resampler {
            active.push(&mono, &mut resampled);
            sink.write(&resampled)?;
        } else {
            sink.write(&mono)?;
        }
    }

    if let Some(active) = &mut resampler {
        active.finish(&mut resampled);
        sink.write(&resampled)?;
    }
    let wrote_samples = sink.finalize()?;
    if meter.is_measurable() {
        if let Some(callback) = progress.as_deref_mut() {
            callback(1.0);
        }
    }
    if !wrote_samples {
        return Err(anyhow!("No audio samples decoded"));
    }
    Ok(())
}

struct DecodeProgress {
    total_frames: Option<u64>,
    time_base: Option<TimeBase>,
    duration_ms: Option<f64>,
    last_reported: f32,
}

impl DecodeProgress {
    fn new(
        total_frames: Option<u64>,
        time_base: Option<TimeBase>,
        duration_ms: Option<u64>,
    ) -> Self {
        Self {
            total_frames,
            time_base,
            duration_ms: duration_ms.map(|value| value as f64),
            last_reported: 0.0,
        }
    }

    fn is_measurable(&self) -> bool {
        self.total_frames.is_some() || (self.duration_ms.is_some() && self.time_base.is_some())
    }

    fn observe(&mut self, packet: &Packet, callback: &mut dyn FnMut(f32)) {
        let progress = if let Some(total) = self.total_frames {
            let end = packet.pts.saturating_add(packet.dur).get();
            Some((end as f64 / total as f64).min(1.0) as f32)
        } else if let (Some(duration), Some(time_base)) = (self.duration_ms, self.time_base) {
            time_base
                .calc_time(packet.pts.saturating_add(packet.dur))
                .map(|time| (time.as_millis() as f64 / duration).min(1.0) as f32)
        } else {
            None
        };
        if let Some(value) = progress {
            if value >= 1.0 || value - self.last_reported >= 0.01 {
                callback(value);
                self.last_reported = value;
            }
        }
    }
}

struct MonoWavSink {
    writer: hound::WavWriter<BufWriter<fs::File>>,
    wrote_samples: bool,
}

impl MonoWavSink {
    fn create(output: &Path) -> Result<Self> {
        let file = fs::File::create(output)
            .with_context(|| format!("Failed to create WAV file at {}", output.display()))?;
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let writer = hound::WavWriter::new(BufWriter::new(file), spec)
            .map_err(|error| anyhow!("WAV writer init failed: {error}"))?;
        Ok(Self {
            writer,
            wrote_samples: false,
        })
    }

    fn write(&mut self, samples: &[f32]) -> Result<()> {
        if samples.is_empty() {
            return Ok(());
        }
        for sample in samples {
            let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
            self.writer
                .write_sample(pcm)
                .map_err(|error| anyhow!("WAV write error: {error}"))?;
        }
        self.wrote_samples = true;
        Ok(())
    }

    fn finalize(self) -> Result<bool> {
        self.writer
            .finalize()
            .map_err(|error| anyhow!("WAV finalize error: {error}"))?;
        Ok(self.wrote_samples)
    }
}

fn downmix_f32(input: &[f32], channels: usize, output: &mut Vec<f32>) {
    output.clear();
    if channels <= 1 {
        output.extend_from_slice(input);
        return;
    }
    output.reserve(input.len() / channels);
    for frame in input.chunks_exact(channels) {
        output.push(frame.iter().sum::<f32>() / channels as f32);
    }
}

struct LinearResampler {
    ratio: f64,
    cursor: f64,
    samples: Vec<f32>,
    consumed: usize,
}

impl LinearResampler {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            ratio: input_rate as f64 / output_rate as f64,
            cursor: 0.0,
            samples: Vec::new(),
            consumed: 0,
        }
    }

    fn push(&mut self, input: &[f32], output: &mut Vec<f32>) {
        output.clear();
        if input.is_empty() {
            return;
        }
        self.samples.extend_from_slice(input);
        self.emit(output, false);
    }

    fn finish(&mut self, output: &mut Vec<f32>) {
        output.clear();
        self.emit(output, true);
    }

    fn emit(&mut self, output: &mut Vec<f32>, final_batch: bool) {
        let available = self.samples.len().saturating_sub(self.consumed);
        if available == 0 {
            return;
        }
        let limit = available as f64;
        while self.cursor + 1.0 < limit || (final_batch && self.cursor < limit) {
            let offset = self.cursor.floor() as usize;
            if offset >= available {
                break;
            }
            let index = self.consumed + offset;
            let fraction = self.cursor - offset as f64;
            let left = f64::from(self.samples[index]);
            let right = self
                .samples
                .get(index + 1)
                .copied()
                .map(f64::from)
                .unwrap_or(left);
            output.push((left + (right - left) * fraction) as f32);
            self.cursor += self.ratio;
        }

        let retain_one = if final_batch { 0 } else { 1 };
        let maximum_drop = available.saturating_sub(retain_one);
        let drop_count = (self.cursor.floor() as usize).min(maximum_drop);
        if drop_count != 0 {
            self.consumed += drop_count;
            self.cursor -= drop_count as f64;
            if self.consumed > 8_192 {
                self.samples.drain(..self.consumed);
                self.consumed = 0;
            }
        }
        if final_batch {
            self.samples.clear();
            self.consumed = 0;
            self.cursor = 0.0;
        }
    }
}

pub(super) fn wav_duration_seconds(path: &Path) -> Result<f32> {
    let file = fs::File::open(path)
        .with_context(|| format!("Failed to open WAV file at {}", path.display()))?;
    let reader = hound::WavReader::new(file).map_err(|error| anyhow!("WAV read error: {error}"))?;
    let rate = reader.spec().sample_rate;
    if rate == 0 {
        return Err(anyhow!("Invalid sample rate"));
    }
    Ok(reader.duration() as f32 / rate as f32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_adapter_downmixes_and_delegates_chunking_to_looper() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("stereo.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 1_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for _ in 0..1_700 {
            writer.write_sample(100i16).unwrap();
            writer.write_sample(300i16).unwrap();
        }
        writer.finalize().unwrap();

        let config = looper_ts::LongFormConfig {
            chunk_seconds: 1.0,
            overlap_seconds: 0.2,
            minimum_new_audio_ratio: 0.5,
        };
        let mut chunks = Vec::new();
        stream_wav_chunks(&path, config, |chunk| {
            chunks.push(chunk.clone());
            Ok(())
        })
        .unwrap();
        assert_eq!(
            chunks
                .iter()
                .map(|chunk| (chunk.start_sample, chunk.samples.len(), chunk.is_final))
                .collect::<Vec<_>>(),
            vec![(0, 1_000, false), (800, 900, true)]
        );
        assert!(chunks
            .iter()
            .flat_map(|chunk| &chunk.samples)
            .all(|sample| *sample == 200));
    }

    #[test]
    fn resampler_split_input_matches_contiguous_input() {
        let input = [0.0, 1.0, 2.0, 3.0];
        let mut contiguous = LinearResampler::new(8_000, 16_000);
        let mut expected = Vec::new();
        contiguous.push(&input, &mut expected);
        let mut tail = Vec::new();
        contiguous.finish(&mut tail);
        expected.extend(tail);

        let mut split = LinearResampler::new(8_000, 16_000);
        let mut actual = Vec::new();
        let mut batch = Vec::new();
        split.push(&input[..2], &mut batch);
        actual.extend_from_slice(&batch);
        split.push(&input[2..], &mut batch);
        actual.extend_from_slice(&batch);
        split.finish(&mut batch);
        actual.extend_from_slice(&batch);
        assert_eq!(actual, expected);
    }

    #[test]
    fn compatible_wav_is_copied_byte_for_byte() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.wav");
        let target = directory.path().join("target.wav");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&source, spec).unwrap();
        writer.write_sample(123i16).unwrap();
        writer.finalize().unwrap();
        assert!(copy_compatible_wav(&source, &target).unwrap());
        assert_eq!(fs::read(source).unwrap(), fs::read(target).unwrap());
    }

    #[test]
    fn cancellation_prevents_conversion_and_removes_partial_output() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.wav");
        let target = directory.path().join("target.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 8_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&source, spec).unwrap();
        writer.write_sample(100i16).unwrap();
        writer.write_sample(300i16).unwrap();
        writer.finalize().unwrap();
        let token = CancellationToken::new();
        token.cancel();

        let error = convert_to_wav(&source, &target, "wav", Some(&token), None, None)
            .expect_err("a cancelled conversion must fail");
        assert!(is_cancelled_error(&error));
        assert!(!target.exists());
    }
}
