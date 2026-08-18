//! Desktop microphone capture, recoverable buffering, and canonical WAV preparation.
//!
//! The public manager is deliberately small. Device access lives on a dedicated
//! worker, while signal processing and storage remain deterministic host code.

use std::{
    f32::consts::PI,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Local, TimeZone};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, Stream};
use crossbeam_channel::{bounded, unbounded, Sender};
use looper_ts::{VadMode, VoiceActivityDetector};
use parking_lot::Mutex;
use rubato::{audioadapter_buffers::direct::InterleavedSlice, Fft, FixedSync, Resampler};
use uuid::Uuid;

const ANALYSIS_WINDOW: usize = 512;
const CAPTURE_GATE_LEVEL: f32 = 0.01;
const CANONICAL_RATE: u32 = 16_000;
const CANONICAL_CHANNELS: u16 = 1;
const PCM_BITS: u16 = 16;
const JOURNAL_POLL: Duration = Duration::from_millis(250);

pub const PENDING_DIR_NAME: &str = ".pending";

#[derive(Debug, Clone, PartialEq)]
pub enum RecordingRejectionReason {
    TooShort { duration_ms: i64, min_ms: i64 },
    TooQuiet { rms: f32, threshold: f32 },
    NoSpeechDetected,
    EmptyBuffer,
}

#[derive(Debug, Clone)]
pub struct CompletedRecording {
    pub samples: Vec<i16>,
    pub sample_rate: u32,
    pub channels: u16,
    pub started_at: DateTime<Local>,
    pub ended_at: DateTime<Local>,
    pub pending_path: Option<PathBuf>,
    pub speech_percentage: Option<f32>,
}

#[derive(Debug, Clone)]
pub struct RecordingSaved {
    pub path: PathBuf,
    pub started_at: DateTime<Local>,
    pub ended_at: DateTime<Local>,
    /// Known canonical WAV duration, used when retrying transcription.
    pub duration_override_seconds: Option<f32>,
    pub pending_path: Option<PathBuf>,
}

pub struct ValidationConfig {
    pub min_duration_ms: i64,
    pub min_rms_energy: f32,
    pub min_speech_percentage: f32,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            min_duration_ms: 300,
            min_rms_energy: 0.0002,
            min_speech_percentage: 3.0,
        }
    }
}

struct SpectrumBuffer {
    ring: [f32; ANALYSIS_WINDOW],
    cursor: usize,
    complete: bool,
}

impl SpectrumBuffer {
    fn empty() -> Self {
        Self {
            ring: [0.0; ANALYSIS_WINDOW],
            cursor: 0,
            complete: false,
        }
    }

    fn observe(&mut self, value: f32) {
        self.ring[self.cursor] = value;
        self.cursor = (self.cursor + 1) % ANALYSIS_WINDOW;
        self.complete |= self.cursor == 0;
    }

    fn clear(&mut self) {
        self.ring.fill(0.0);
        self.cursor = 0;
        self.complete = false;
    }

    fn chronological(&self) -> Option<Vec<f32>> {
        self.complete.then(|| {
            self.ring[self.cursor..]
                .iter()
                .chain(&self.ring[..self.cursor])
                .copied()
                .collect()
        })
    }
}

#[derive(Clone, Copy)]
struct PcmShape {
    rate: u32,
    channels: u16,
}

struct LiveAudioTap {
    samples: Arc<Mutex<Vec<i16>>>,
    shape: PcmShape,
}

impl LiveAudioTap {
    fn read_from(&self, offset: usize) -> (Vec<f32>, u32, usize) {
        let samples = self.samples.lock();
        if offset >= samples.len() {
            return (Vec::new(), self.shape.rate, offset);
        }

        let next = samples.len();
        let source = &samples[offset..];
        let channels = usize::from(self.shape.channels);
        let mono = if channels <= 1 {
            source
                .iter()
                .map(|sample| pcm_i16_to_f32(*sample))
                .collect()
        } else {
            source
                .chunks(channels)
                .map(|frame| {
                    let total = frame
                        .iter()
                        .fold(0.0, |sum, sample| sum + f32::from(*sample));
                    total / channels as f32 / i16::MAX as f32
                })
                .collect()
        };
        (mono, self.shape.rate, next)
    }
}

struct RecorderState {
    spectrum: Mutex<SpectrumBuffer>,
    live: Mutex<Option<LiveAudioTap>>,
    armed: AtomicBool,
}

impl RecorderState {
    fn new() -> Self {
        Self {
            spectrum: Mutex::new(SpectrumBuffer::empty()),
            live: Mutex::new(None),
            armed: AtomicBool::new(false),
        }
    }

    fn prepare(&self) {
        self.spectrum.lock().clear();
        self.armed.store(false, Ordering::Relaxed);
    }

    fn disconnect(&self) {
        *self.live.lock() = None;
        self.spectrum.lock().clear();
    }
}

type StopHook = Box<dyn FnOnce() + Send + 'static>;

enum CaptureRequest {
    Begin {
        selected_device: Option<String>,
        journal_dir: Option<PathBuf>,
        reply: Sender<Result<DateTime<Local>>>,
    },
    Finish {
        reply: Sender<Result<Option<CompletedRecording>>>,
        hook: StopHook,
        journal: JournalDisposition,
    },
}

pub struct RecorderManager {
    requests: Sender<CaptureRequest>,
    shared: Arc<RecorderState>,
}

impl Default for RecorderManager {
    fn default() -> Self {
        let (requests, inbox) = unbounded();
        let shared = Arc::new(RecorderState::new());
        let worker_state = Arc::clone(&shared);
        std::thread::Builder::new()
            .name("looper-recorder".into())
            .spawn(move || {
                let mut worker = CaptureWorker::new(worker_state);
                while let Ok(request) = inbox.recv() {
                    worker.handle(request);
                }
            })
            .expect("failed to spawn recorder thread");
        Self { requests, shared }
    }
}

impl RecorderManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn arm(&self) {
        self.shared.armed.store(true, Ordering::Relaxed);
    }

    pub fn spectrum_snapshot(&self) -> Option<Vec<f32>> {
        self.shared
            .spectrum
            .try_lock()
            .and_then(|window| window.chronological())
    }

    /// Returns new mono samples, their source rate, and the next raw-buffer offset.
    pub fn read_live_samples(&self, offset: usize) -> Option<(Vec<f32>, u32, usize)> {
        self.shared
            .live
            .lock()
            .as_ref()
            .map(|tap| tap.read_from(offset))
    }

    pub fn start(
        &self,
        device_id: Option<String>,
        pending_dir: Option<PathBuf>,
    ) -> Result<DateTime<Local>> {
        let (reply, answer) = bounded(1);
        self.requests
            .send(CaptureRequest::Begin {
                selected_device: device_id,
                journal_dir: pending_dir,
                reply,
            })
            .map_err(|error| anyhow!("Recorder channel closed: {error}"))?;
        answer
            .recv()
            .map_err(|error| anyhow!("Recorder not responding: {error}"))?
    }

    pub fn stop(&self) -> Result<Option<CompletedRecording>> {
        self.stop_after_capture_and_discard_pending(|| {})
    }

    pub fn stop_after_capture(
        &self,
        after_capture: impl FnOnce() + Send + 'static,
    ) -> Result<Option<CompletedRecording>> {
        self.finish(after_capture, JournalDisposition::Keep)
    }

    pub fn stop_after_capture_and_discard_pending(
        &self,
        after_capture: impl FnOnce() + Send + 'static,
    ) -> Result<Option<CompletedRecording>> {
        self.finish(after_capture, JournalDisposition::Discard)
    }

    fn finish(
        &self,
        after_capture: impl FnOnce() + Send + 'static,
        journal: JournalDisposition,
    ) -> Result<Option<CompletedRecording>> {
        let (reply, answer) = bounded(1);
        self.requests
            .send(CaptureRequest::Finish {
                reply,
                hook: Box::new(after_capture),
                journal,
            })
            .map_err(|error| anyhow!("Recorder channel closed: {error}"))?;
        answer
            .recv()
            .map_err(|error| anyhow!("Recorder not responding: {error}"))?
    }
}

struct RecordingSession {
    stream: Stream,
    samples: Arc<Mutex<Vec<i16>>>,
    shape: PcmShape,
    started_at: DateTime<Local>,
    journal: Option<PartialJournal>,
}

struct CaptureWorker {
    session: Option<RecordingSession>,
    shared: Arc<RecorderState>,
}

impl CaptureWorker {
    fn new(shared: Arc<RecorderState>) -> Self {
        Self {
            session: None,
            shared,
        }
    }

    fn handle(&mut self, request: CaptureRequest) {
        match request {
            CaptureRequest::Begin {
                selected_device,
                journal_dir,
                reply,
            } => {
                let _ = reply.send(self.begin(selected_device, journal_dir));
            }
            CaptureRequest::Finish {
                reply,
                hook,
                journal,
            } => {
                let _ = reply.send(self.finish(hook, journal));
            }
        }
    }

    fn begin(
        &mut self,
        selected_device: Option<String>,
        journal_dir: Option<PathBuf>,
    ) -> Result<DateTime<Local>> {
        if self.session.is_some() {
            return Err(anyhow!("Recording is already in progress"));
        }

        let host = cpal::default_host();
        let device = select_input(&host, selected_device.as_deref())?;
        let supported = device
            .default_input_config()
            .context("No supported input configuration found")?;
        let format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let shape = PcmShape {
            rate: config.sample_rate,
            channels: config.channels,
        };
        let initial_capacity = usize::try_from(shape.rate)
            .unwrap_or(48_000)
            .saturating_mul(usize::from(shape.channels))
            .max(48_000);
        let samples = Arc::new(Mutex::new(Vec::with_capacity(initial_capacity)));

        self.shared.prepare();
        let stream = open_input_stream(
            &device,
            config,
            format,
            Arc::clone(&samples),
            Arc::clone(&self.shared),
        )?;
        stream.play()?;
        *self.shared.live.lock() = Some(LiveAudioTap {
            samples: Arc::clone(&samples),
            shape,
        });

        let started_at = Local::now();
        let journal = journal_dir.and_then(|directory| {
            match PartialJournal::start(directory, Arc::clone(&samples), shape, started_at) {
                Ok(writer) => Some(writer),
                Err(error) => {
                    tracing::error!("Crash-safe recording writer unavailable: {error}");
                    None
                }
            }
        });
        self.session = Some(RecordingSession {
            stream,
            samples,
            shape,
            started_at,
            journal,
        });
        Ok(started_at)
    }

    fn finish(
        &mut self,
        hook: StopHook,
        disposition: JournalDisposition,
    ) -> Result<Option<CompletedRecording>> {
        self.shared.disconnect();
        let Some(session) = self.session.take() else {
            hook();
            return Ok(None);
        };
        let RecordingSession {
            stream,
            samples,
            shape,
            started_at,
            journal,
        } = session;
        drop(stream);
        let pending_path = journal.and_then(|writer| writer.close(disposition));
        let ended_at = Local::now();
        hook();
        let captured = Arc::try_unwrap(samples)
            .map(|mutex| mutex.into_inner())
            .unwrap_or_else(|shared| shared.lock().clone());
        let processed = AudioProcessor::run(&captured, shape);
        Ok(Some(CompletedRecording {
            samples: processed.samples,
            sample_rate: processed.shape.rate,
            channels: processed.shape.channels,
            started_at,
            ended_at,
            pending_path,
            speech_percentage: processed.speech_percentage,
        }))
    }
}

fn select_input(host: &cpal::Host, requested: Option<&str>) -> Result<cpal::Device> {
    let Some(requested) = requested else {
        return host
            .default_input_device()
            .context("No default input device found");
    };

    let direct = requested
        .parse::<cpal::DeviceId>()
        .ok()
        .and_then(|identifier| host.device_by_id(&identifier));
    let enumerated = || {
        host.input_devices().ok()?.find(|candidate| {
            let identifier_matches = candidate
                .id()
                .map(|identifier| identifier.to_string() == requested)
                .unwrap_or(false);
            let name_matches = candidate
                .description()
                .map(|description| description.name() == requested)
                .unwrap_or(false);
            identifier_matches || name_matches
        })
    };
    direct
        .or_else(enumerated)
        .or_else(|| host.default_input_device())
        .context("Selected device not found and no default available")
}

#[derive(Clone, Copy)]
enum JournalDisposition {
    Keep,
    Discard,
}

struct PartialJournal {
    stopping: Arc<AtomicBool>,
    writer: Option<JoinHandle<()>>,
    path: PathBuf,
}

impl PartialJournal {
    fn start(
        directory: PathBuf,
        samples: Arc<Mutex<Vec<i16>>>,
        shape: PcmShape,
        started_at: DateTime<Local>,
    ) -> Result<Self> {
        fs::create_dir_all(&directory)
            .with_context(|| format!("Failed to create pending dir at {}", directory.display()))?;
        let name = format!(
            "{}-{}.partial.wav",
            started_at.timestamp_millis(),
            Uuid::new_v4().simple()
        );
        let path = directory.join(name);
        let spec = wav_spec(shape);
        let mut sink = hound::WavWriter::create(&path, spec)
            .map_err(|error| anyhow!("Failed to create partial WAV: {error}"))?;
        let stopping = Arc::new(AtomicBool::new(false));
        let stop_signal = Arc::clone(&stopping);
        let chunk_limit = usize::try_from(shape.rate)
            .unwrap_or(1)
            .saturating_mul(usize::from(shape.channels))
            .max(1);
        let writer = std::thread::Builder::new()
            .name("looper-pending-writer".into())
            .spawn(move || {
                let mut cursor = 0;
                loop {
                    let should_stop = stop_signal.load(Ordering::Relaxed);
                    let (chunk, more) = journal_chunk(&samples, &mut cursor, chunk_limit);
                    for value in &chunk {
                        let _ = sink.write_sample(*value);
                    }
                    if !chunk.is_empty() {
                        let _ = sink.flush();
                    }
                    if should_stop && !more {
                        break;
                    }
                    if !more {
                        std::thread::sleep(JOURNAL_POLL);
                    }
                }
                let _ = sink.finalize();
            })
            .map_err(|error| anyhow!("Failed to spawn pending writer thread: {error}"))?;
        Ok(Self {
            stopping,
            writer: Some(writer),
            path,
        })
    }

    fn close(mut self, disposition: JournalDisposition) -> Option<PathBuf> {
        self.stopping.store(true, Ordering::Relaxed);
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
        match disposition {
            JournalDisposition::Keep => Some(self.path),
            JournalDisposition::Discard => {
                let _ = fs::remove_file(self.path);
                None
            }
        }
    }
}

fn journal_chunk(samples: &Mutex<Vec<i16>>, cursor: &mut usize, limit: usize) -> (Vec<i16>, bool) {
    let captured = samples.lock();
    if *cursor >= captured.len() {
        return (Vec::new(), false);
    }
    let end = cursor.saturating_add(limit).min(captured.len());
    let chunk = captured[*cursor..end].to_vec();
    *cursor = end;
    (chunk, end < captured.len())
}

struct CaptureSink {
    samples: Arc<Mutex<Vec<i16>>>,
    shared: Arc<RecorderState>,
    channels: usize,
}

impl CaptureSink {
    fn accept<T>(&self, data: &[T])
    where
        T: Sample,
        i16: FromSample<T>,
        f32: FromSample<T>,
    {
        if !self.shared.armed.load(Ordering::Relaxed) {
            let peak = data
                .iter()
                .copied()
                .map(f32::from_sample)
                .map(f32::abs)
                .fold(0.0, f32::max);
            if peak < CAPTURE_GATE_LEVEL {
                return;
            }
            self.shared.armed.store(true, Ordering::Relaxed);
        }

        if let Some(mut spectrum) = self.shared.spectrum.try_lock() {
            for frame in data.chunks(self.channels) {
                let total = frame
                    .iter()
                    .copied()
                    .map(f32::from_sample)
                    .map(|sample| sample.clamp(-1.0, 1.0))
                    .sum::<f32>();
                spectrum.observe(total / frame.len() as f32);
            }
        }
        self.samples
            .lock()
            .extend(data.iter().copied().map(i16::from_sample));
    }
}

fn open_input_stream(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    format: SampleFormat,
    samples: Arc<Mutex<Vec<i16>>>,
    shared: Arc<RecorderState>,
) -> Result<Stream> {
    macro_rules! for_format {
        ($sample:ty) => {
            make_input_stream::<$sample>(device, config, samples, shared).map_err(Into::into)
        };
    }
    match format {
        SampleFormat::F32 => for_format!(f32),
        SampleFormat::F64 => for_format!(f64),
        SampleFormat::I8 => for_format!(i8),
        SampleFormat::I16 => for_format!(i16),
        SampleFormat::I24 => for_format!(cpal::I24),
        SampleFormat::I32 => for_format!(i32),
        SampleFormat::U8 => for_format!(u8),
        SampleFormat::U16 => for_format!(u16),
        SampleFormat::U32 => for_format!(u32),
        unsupported => Err(anyhow!("Unsupported sample format: {unsupported}")),
    }
}

fn make_input_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    samples: Arc<Mutex<Vec<i16>>>,
    shared: Arc<RecorderState>,
) -> Result<Stream, cpal::Error>
where
    T: SizedSample + 'static,
    i16: FromSample<T>,
    f32: FromSample<T>,
{
    let sink = CaptureSink {
        samples,
        shared,
        channels: usize::from(config.channels).max(1),
    };
    device.build_input_stream(
        config,
        move |input: &[T], _| sink.accept(input),
        |error| tracing::error!("Microphone stream error: {error}"),
        None,
    )
}

struct ProcessedAudio {
    samples: Vec<i16>,
    shape: PcmShape,
    speech_percentage: Option<f32>,
}

struct AudioProcessor;

impl AudioProcessor {
    fn run(raw: &[i16], source: PcmShape) -> ProcessedAudio {
        let mut signal = mono_f32(raw, usize::from(source.channels));
        if signal.is_empty() {
            return ProcessedAudio {
                samples: raw.to_vec(),
                shape: source,
                speech_percentage: None,
            };
        }

        SignalFilters::for_rate(source.rate).apply(&mut signal);
        if source.rate != CANONICAL_RATE {
            signal = resample_audio(&signal, source.rate, CANONICAL_RATE);
        }
        let (trimmed, speech_percentage) = match SpeechCrop::analyze(&signal, CANONICAL_RATE) {
            Some(crop) => crop.into_output(&signal),
            None => (signal.clone(), None),
        };
        let mut output = if trimmed.is_empty() { signal } else { trimmed };
        DynamicRange::apply(&mut output, CANONICAL_RATE);
        let samples = output.into_iter().map(pcm_f32_to_i16).collect();
        ProcessedAudio {
            samples,
            shape: PcmShape {
                rate: CANONICAL_RATE,
                channels: CANONICAL_CHANNELS,
            },
            speech_percentage,
        }
    }
}

struct SignalFilters {
    high_pass: OnePoleHighPass,
    low_pass: OnePoleLowPass,
}

impl SignalFilters {
    fn for_rate(rate: u32) -> Self {
        Self {
            high_pass: OnePoleHighPass::new(rate, 120.0),
            low_pass: OnePoleLowPass::new(rate, 8_000.0),
        }
    }

    fn apply(mut self, signal: &mut [f32]) {
        self.high_pass.apply(signal);
        self.low_pass.apply(signal);
    }
}

struct OnePoleHighPass {
    alpha: f32,
}

impl OnePoleHighPass {
    fn new(rate: u32, cutoff: f32) -> Self {
        let nyquist_safe = cutoff.min(rate as f32 / 2.0 - 10.0).max(20.0);
        let rc = 1.0 / (2.0 * PI * nyquist_safe);
        let step = 1.0 / rate as f32;
        Self {
            alpha: rc / (rc + step),
        }
    }

    fn apply(&mut self, signal: &mut [f32]) {
        let Some(first) = signal.first().copied() else {
            return;
        };
        let mut prior_output = first;
        let mut prior_input = first;
        for value in signal {
            let input = *value;
            let output = self.alpha * (prior_output + input - prior_input);
            prior_output = output;
            prior_input = input;
            *value = output;
        }
    }
}

struct OnePoleLowPass {
    alpha: f32,
}

impl OnePoleLowPass {
    fn new(rate: u32, cutoff: f32) -> Self {
        let nyquist_safe = cutoff.min(rate as f32 / 2.0 - 10.0).max(200.0);
        let rc = 1.0 / (2.0 * PI * nyquist_safe);
        let step = 1.0 / rate as f32;
        Self {
            alpha: step / (rc + step),
        }
    }

    fn apply(&mut self, signal: &mut [f32]) {
        let Some(mut prior) = signal.first().copied() else {
            return;
        };
        for value in signal {
            prior += self.alpha * (*value - prior);
            *value = prior;
        }
    }
}

struct DynamicRange;

impl DynamicRange {
    fn apply(signal: &mut [f32], rate: u32) {
        Compressor::default().apply(signal);
        FrameNormalizer::new(rate).apply(signal);
        PeakLimiter::new(0.95).apply(signal);
    }
}

struct Compressor {
    threshold: f32,
    ratio: f32,
    attack: f32,
    release: f32,
}

impl Default for Compressor {
    fn default() -> Self {
        Self {
            threshold: 0.2,
            ratio: 2.0,
            attack: 0.2,
            release: 0.02,
        }
    }
}

impl Compressor {
    fn apply(&self, signal: &mut [f32]) {
        let mut gain = 1.0;
        for value in signal {
            let level = value.abs();
            let target = if level > self.threshold {
                let excess = level / self.threshold;
                let compressed = self.threshold * (1.0 + (excess - 1.0) / self.ratio);
                (compressed / level).clamp(0.1, 1.0)
            } else {
                1.0
            };
            let speed = if target < gain {
                self.attack
            } else {
                self.release
            };
            gain += (target - gain) * speed;
            *value *= gain;
        }
    }
}

struct FrameNormalizer {
    frame_size: usize,
}

impl FrameNormalizer {
    fn new(rate: u32) -> Self {
        Self {
            frame_size: (rate as usize / 100).max(256),
        }
    }

    fn apply(&self, signal: &mut [f32]) {
        let Some(profile) = GainProfile::measure(signal, self.frame_size) else {
            return;
        };
        let mut gain = 1.0;
        for frame in signal.chunks_mut(self.frame_size) {
            let desired = profile.desired_gain(rms_f32(frame));
            let speed = if desired > gain { 0.14 } else { 0.04 };
            gain += (desired - gain) * speed;
            frame.iter_mut().for_each(|sample| *sample *= gain);
        }
    }
}

struct GainProfile {
    speech_gate: f32,
    target: f32,
    maximum: f32,
}

impl GainProfile {
    fn measure(signal: &[f32], frame_size: usize) -> Option<Self> {
        let mut levels: Vec<_> = signal.chunks(frame_size).map(rms_f32).collect();
        if levels.is_empty() {
            return None;
        }
        levels.sort_by(f32::total_cmp);
        let noise = percentile(&levels, 0.2).clamp(0.0008, 0.006);
        let speech_gate = (noise * 2.5).clamp(0.0015, 0.03);
        let speech = percentile(&levels, 0.65).max(speech_gate);
        let target = if speech < 0.06 { 0.20 } else { 0.18 };
        let noisy = noise / speech.max(noise) > 0.15;
        Some(Self {
            speech_gate,
            target,
            maximum: if noisy { 3.0 } else { 5.0 },
        })
    }

    fn desired_gain(&self, level: f32) -> f32 {
        if level < self.speech_gate {
            1.0
        } else {
            (self.target / level).clamp(0.6, self.maximum)
        }
    }
}

fn percentile(sorted: &[f32], position: f32) -> f32 {
    let last = sorted.len() - 1;
    let index = (last as f32 * position.clamp(0.0, 1.0)).round() as usize;
    sorted[index]
}

struct PeakLimiter {
    ceiling: f32,
}

impl PeakLimiter {
    fn new(ceiling: f32) -> Self {
        Self { ceiling }
    }

    fn apply(&self, signal: &mut [f32]) {
        let peak = signal.iter().copied().map(f32::abs).fold(0.0, f32::max);
        if peak > self.ceiling {
            let scale = self.ceiling / peak;
            signal.iter_mut().for_each(|value| *value *= scale);
        }
    }
}

struct SpeechCrop {
    frame_len: usize,
    vad_rate: u32,
    source_rate: u32,
    voiced: Vec<bool>,
    retained: Vec<bool>,
}

impl SpeechCrop {
    fn analyze(signal: &[f32], source_rate: u32) -> Option<Self> {
        if signal.is_empty() {
            return None;
        }
        let vad_rate = match source_rate {
            8_000 | 16_000 | 32_000 | 48_000 => source_rate,
            _ => 16_000,
        };
        let analysis: Vec<i16> = if vad_rate == source_rate {
            signal.iter().copied().map(pcm_f32_to_i16).collect()
        } else {
            resample_audio(signal, source_rate, vad_rate)
                .into_iter()
                .map(pcm_f32_to_i16)
                .collect()
        };
        let frame_len = vad_rate as usize * 30 / 1_000;
        if frame_len == 0 || analysis.len() < frame_len {
            return None;
        }
        let mut detector = VoiceActivityDetector::new(vad_rate, VadMode::Quality).ok()?;
        let voiced: Vec<_> = analysis
            .chunks(frame_len)
            .take_while(|frame| frame.len() == frame_len)
            .map(|frame| detector.is_speech(frame).unwrap_or(true))
            .collect();
        if voiced.is_empty() || voiced.iter().all(|value| !*value) {
            return None;
        }
        let retained = RetentionMask::from_voice(&voiced).into_inner();
        Some(Self {
            frame_len,
            vad_rate,
            source_rate,
            voiced,
            retained,
        })
    }

    fn into_output(self, source: &[f32]) -> (Vec<f32>, Option<f32>) {
        let voiced = self.voiced.iter().filter(|value| **value).count();
        let kept = self.retained.iter().filter(|value| **value).count();
        let share = (kept > 0).then(|| voiced as f32 / kept as f32 * 100.0);
        let scale = self.source_rate as f32 / self.vad_rate as f32;
        let intervals = retained_intervals(&self.retained, self.frame_len, scale);
        let mut output = Vec::new();
        for (start, end) in intervals {
            let start = start.min(source.len());
            let end = end.min(source.len());
            if start < end {
                output.extend_from_slice(&source[start..end]);
            }
        }
        if output.is_empty() {
            (source.to_vec(), share)
        } else {
            (output, share)
        }
    }
}

struct RetentionMask(Vec<bool>);

impl RetentionMask {
    fn from_voice(voiced: &[bool]) -> Self {
        let mut mask = vec![false; voiced.len()];
        let mut tail = 0;
        let tail_frames = (350.0_f32 / 30.0).ceil() as usize;
        for (index, is_voice) in voiced.iter().copied().enumerate() {
            if is_voice {
                mask[index] = true;
                tail = tail_frames;
            } else if tail > 0 {
                mask[index] = true;
                tail -= 1;
            }
        }
        Self::fill_short_gaps(&mut mask, (600.0_f32 / 30.0).ceil() as usize);
        Self::add_preroll(&mut mask, 4);
        Self(mask)
    }

    fn fill_short_gaps(mask: &mut [bool], maximum: usize) {
        let mut cursor = 0;
        while cursor < mask.len() {
            if mask[cursor] {
                cursor += 1;
                continue;
            }
            let start = cursor;
            while cursor < mask.len() && !mask[cursor] {
                cursor += 1;
            }
            if cursor - start <= maximum {
                mask[start..cursor].fill(true);
            }
        }
    }

    fn add_preroll(mask: &mut [bool], frames: usize) {
        for index in 0..mask.len() {
            if mask[index] {
                mask[index.saturating_sub(frames)..index].fill(true);
            }
        }
    }

    fn into_inner(self) -> Vec<bool> {
        self.0
    }
}

fn retained_intervals(mask: &[bool], frame_len: usize, scale: f32) -> Vec<(usize, usize)> {
    let mut intervals = Vec::new();
    let mut open: Option<(usize, usize)> = None;
    for (index, keep) in mask.iter().copied().enumerate() {
        let start = (index * frame_len) as f32 * scale;
        let end = ((index + 1) * frame_len) as f32 * scale;
        let bounds = (start as usize, end.ceil() as usize);
        match (keep, open.as_mut()) {
            (true, Some(interval)) => interval.1 = bounds.1,
            (true, None) => open = Some(bounds),
            (false, Some(_)) => intervals.push(open.take().expect("open interval")),
            (false, None) => {}
        }
    }
    if let Some(interval) = open {
        intervals.push(interval);
    }
    intervals
}

pub fn validate_recording(recording: &CompletedRecording) -> Result<(), RecordingRejectionReason> {
    validate_recording_with_config(recording, &ValidationConfig::default())
}

pub fn validate_recording_with_config(
    recording: &CompletedRecording,
    config: &ValidationConfig,
) -> Result<(), RecordingRejectionReason> {
    RecordingValidator { config }.check(recording)
}

struct RecordingValidator<'a> {
    config: &'a ValidationConfig,
}

impl RecordingValidator<'_> {
    fn check(&self, recording: &CompletedRecording) -> Result<(), RecordingRejectionReason> {
        if recording.samples.is_empty() {
            return Err(RecordingRejectionReason::EmptyBuffer);
        }
        let elapsed = (recording.ended_at - recording.started_at).num_milliseconds();
        if elapsed < self.config.min_duration_ms {
            return Err(RecordingRejectionReason::TooShort {
                duration_ms: elapsed,
                min_ms: self.config.min_duration_ms,
            });
        }
        let energy = rms_i16(&recording.samples);
        if energy < self.config.min_rms_energy {
            return Err(RecordingRejectionReason::TooQuiet {
                rms: energy,
                threshold: self.config.min_rms_energy,
            });
        }
        let measure = || {
            looper_ts::speech_ratio(&recording.samples, recording.sample_rate, VadMode::Quality)
                .unwrap_or(1.0)
                * 100.0
        };
        let cached = recording.speech_percentage;
        let mut speech = cached.unwrap_or_else(measure);
        if cached.is_some() && speech < self.config.min_speech_percentage {
            speech = measure();
        }
        if speech < self.config.min_speech_percentage {
            Err(RecordingRejectionReason::NoSpeechDetected)
        } else {
            Ok(())
        }
    }
}

pub fn persist_recording(
    base_dir: PathBuf,
    recording: &CompletedRecording,
) -> Result<RecordingSaved> {
    RecordingArchive::new(base_dir).save(recording)
}

struct RecordingArchive {
    root: PathBuf,
}

impl RecordingArchive {
    fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn save(&self, recording: &CompletedRecording) -> Result<RecordingSaved> {
        if recording.samples.is_empty() {
            return Err(anyhow!("Recording buffer is empty"));
        }
        let folder = self
            .root
            .join(recording.started_at.format("%Y-%m-%d").to_string());
        fs::create_dir_all(&folder).with_context(|| {
            format!("Failed to create recording folder at {}", folder.display())
        })?;
        let canonical = canonical_samples(
            &recording.samples,
            PcmShape {
                rate: recording.sample_rate,
                channels: recording.channels,
            },
        );
        if canonical.is_empty() {
            return Err(anyhow!("Recording buffer is empty"));
        }
        let path = folder.join(archive_file_name(recording.started_at));
        let encoded = encode_wav(
            &canonical,
            PcmShape {
                rate: CANONICAL_RATE,
                channels: CANONICAL_CHANNELS,
            },
        )?;
        fs::write(&path, encoded)
            .with_context(|| format!("Failed to write recording file at {}", path.display()))?;
        Ok(RecordingSaved {
            path,
            started_at: recording.started_at,
            ended_at: recording.ended_at,
            duration_override_seconds: Some(canonical.len() as f32 / CANONICAL_RATE as f32),
            pending_path: recording.pending_path.clone(),
        })
    }
}

fn archive_file_name(started_at: DateTime<Local>) -> String {
    format!(
        "{}-{:03}-{}.wav",
        started_at.format("%H%M%S"),
        started_at.timestamp_subsec_millis(),
        Uuid::new_v4().simple()
    )
}

fn canonical_samples(samples: &[i16], source: PcmShape) -> Vec<i16> {
    if samples.is_empty() {
        return Vec::new();
    }
    let mono = if source.channels > 1 {
        downmix_to_mono(samples, usize::from(source.channels))
    } else {
        samples.to_vec()
    };
    if source.rate == CANONICAL_RATE {
        return mono;
    }
    let signal: Vec<_> = mono.into_iter().map(pcm_i16_to_f32).collect();
    resample_audio(&signal, source.rate, CANONICAL_RATE)
        .into_iter()
        .map(pcm_f32_to_i16)
        .collect()
}

fn wav_spec(shape: PcmShape) -> hound::WavSpec {
    hound::WavSpec {
        channels: shape.channels,
        sample_rate: shape.rate,
        bits_per_sample: PCM_BITS,
        sample_format: hound::SampleFormat::Int,
    }
}

fn encode_wav(samples: &[i16], shape: PcmShape) -> Result<Vec<u8>> {
    if samples.is_empty() {
        return Err(anyhow!("Recording buffer is empty"));
    }
    let mut bytes = Cursor::new(Vec::new());
    {
        let mut encoder = hound::WavWriter::new(&mut bytes, wav_spec(shape))
            .map_err(|error| anyhow!("WAV writer init failed: {error}"))?;
        for value in samples {
            encoder
                .write_sample(*value)
                .map_err(|error| anyhow!("WAV write error: {error}"))?;
        }
        encoder
            .finalize()
            .map_err(|error| anyhow!("WAV finalize error: {error}"))?;
    }
    Ok(bytes.into_inner())
}

pub fn recover_pending_recordings(base_dir: PathBuf) -> Vec<(RecordingSaved, CompletedRecording)> {
    RecoveryScan::new(base_dir).run()
}

struct RecoveryScan {
    archive: RecordingArchive,
    pending: PathBuf,
}

impl RecoveryScan {
    fn new(root: PathBuf) -> Self {
        Self {
            pending: root.join(PENDING_DIR_NAME),
            archive: RecordingArchive::new(root),
        }
    }

    fn run(&self) -> Vec<(RecordingSaved, CompletedRecording)> {
        let Ok(entries) = fs::read_dir(&self.pending) else {
            return Vec::new();
        };
        let began_at = Local::now();
        let mut recovered = Vec::new();
        for path in entries.flatten().map(|entry| entry.path()) {
            if !self.is_recoverable(&path, began_at) {
                continue;
            }
            match self.recover(&path) {
                Ok(Some(item)) => recovered.push(item),
                Ok(None) => {
                    let _ = fs::remove_file(path);
                }
                Err(error) => {
                    tracing::error!("Failed to recover {}: {error}", path.display());
                    let failed = path.with_extension("wav.failed");
                    let _ = fs::rename(path, failed);
                }
            }
        }
        recovered.sort_by(|left, right| right.0.started_at.cmp(&left.0.started_at));
        recovered
    }

    fn is_recoverable(&self, path: &Path, began_at: DateTime<Local>) -> bool {
        let partial = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".partial.wav"));
        partial && partial_started_at(path).is_none_or(|started| started < began_at)
    }

    fn recover(&self, path: &Path) -> Result<Option<(RecordingSaved, CompletedRecording)>> {
        let reader = hound::WavReader::open(path)
            .map_err(|error| anyhow!("Unable to read partial WAV: {error}"))?;
        let spec = reader.spec();
        let raw: Vec<i16> = reader
            .into_samples::<i16>()
            .filter_map(Result::ok)
            .collect();
        if raw.is_empty() {
            return Ok(None);
        }
        let started_at = partial_started_at(path).unwrap_or_else(Local::now);
        let frames = raw.len() / usize::from(spec.channels.max(1));
        let milliseconds = frames as f64 / f64::from(spec.sample_rate.max(1)) * 1_000.0;
        let ended_at = started_at + chrono::Duration::milliseconds(milliseconds as i64);
        let processed = AudioProcessor::run(
            &raw,
            PcmShape {
                rate: spec.sample_rate,
                channels: spec.channels,
            },
        );
        if processed.samples.is_empty() {
            return Ok(None);
        }
        let recording = CompletedRecording {
            samples: processed.samples,
            sample_rate: processed.shape.rate,
            channels: processed.shape.channels,
            started_at,
            ended_at,
            pending_path: Some(path.to_path_buf()),
            speech_percentage: processed.speech_percentage,
        };
        let saved = self.archive.save(&recording)?;
        Ok(Some((saved, recording)))
    }
}

fn partial_started_at(path: &Path) -> Option<DateTime<Local>> {
    let name = path.file_name()?.to_str()?;
    let millis = name.split('-').next()?.parse().ok()?;
    Local.timestamp_millis_opt(millis).single()
}

fn rms_f32(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let energy = samples.iter().fold(0.0, |sum, value| sum + value * value);
    (energy / samples.len() as f32).sqrt()
}

fn rms_i16(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let inverse_scale = 1.0 / i16::MAX as f64;
    let energy = samples.iter().fold(0.0, |sum, value| {
        let normalized = f64::from(*value) * inverse_scale;
        sum + normalized * normalized
    });
    (energy / samples.len() as f64).sqrt() as f32
}

fn pcm_i16_to_f32(sample: i16) -> f32 {
    sample as f32 / i16::MAX as f32
}

fn pcm_f32_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
}

fn mono_f32(samples: &[i16], channels: usize) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }
    if channels <= 1 {
        return samples.iter().copied().map(pcm_i16_to_f32).collect();
    }
    samples
        .chunks_exact(channels)
        .map(|frame| {
            frame.iter().fold(0.0, |sum, value| sum + f32::from(*value))
                / channels as f32
                / i16::MAX as f32
        })
        .collect()
}

pub(crate) fn downmix_to_mono(samples: &[i16], channels: usize) -> Vec<i16> {
    if channels <= 1 {
        return samples.to_vec();
    }
    samples
        .chunks_exact(channels)
        .map(|frame| {
            let total = frame
                .iter()
                .fold(0_i32, |sum, value| sum + i32::from(*value));
            (total / channels as i32) as i16
        })
        .collect()
}

pub(crate) fn resample_audio(input: &[f32], in_rate: u32, out_rate: u32) -> Vec<f32> {
    if input.is_empty() {
        return Vec::new();
    }
    if in_rate == out_rate {
        return input.to_vec();
    }
    RubatoResampler::convert(input, in_rate, out_rate).unwrap_or_else(|| {
        tracing::error!(
            "rubato resampler failed ({in_rate}→{out_rate}); falling back to linear resampler"
        );
        linear_resample(input, in_rate, out_rate)
    })
}

struct RubatoResampler;

impl RubatoResampler {
    fn convert(input: &[f32], source_rate: u32, target_rate: u32) -> Option<Vec<f32>> {
        let mut resampler = Fft::<f32>::new(
            source_rate as usize,
            target_rate as usize,
            1_024,
            1,
            1,
            FixedSync::Both,
        )
        .ok()?;
        let source = InterleavedSlice::new(input, 1, input.len()).ok()?;
        let capacity = resampler.process_all_needed_output_len(input.len());
        let mut output = vec![0.0; capacity];
        let mut destination = InterleavedSlice::new_mut(&mut output, 1, capacity).ok()?;
        let (_, written) = resampler
            .process_all_into_buffer(&source, &mut destination, input.len(), None)
            .ok()?;
        output.truncate(written);
        Some(output)
    }
}

fn linear_resample(input: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    let ratio = target_rate as f64 / source_rate as f64;
    let count = (input.len() as f64 * ratio).max(1.0).round() as usize;
    if count <= 1 {
        return vec![input[0]];
    }
    (0..count)
        .map(|output_index| {
            let position = output_index as f64 / ratio;
            let left = position.floor() as usize;
            let fraction = position - left as f64;
            let right = (left + 1).min(input.len() - 1);
            (input[left] as f64 * (1.0 - fraction) + input[right] as f64 * fraction) as f32
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration as ChronoDuration;

    fn instant(milliseconds: i64) -> DateTime<Local> {
        Local.timestamp_millis_opt(milliseconds).single().unwrap()
    }

    fn recording(samples: Vec<i16>, elapsed_ms: i64) -> CompletedRecording {
        let started_at = instant(1_700_000_000_000);
        CompletedRecording {
            samples,
            sample_rate: CANONICAL_RATE,
            channels: 1,
            started_at,
            ended_at: started_at + ChronoDuration::milliseconds(elapsed_ms),
            pending_path: None,
            speech_percentage: Some(100.0),
        }
    }

    #[test]
    fn spectrum_is_hidden_until_full_then_returns_capture_order() {
        let mut spectrum = SpectrumBuffer::empty();
        for value in 0..ANALYSIS_WINDOW {
            spectrum.observe(value as f32);
        }
        spectrum.observe(999.0);
        let snapshot = spectrum.chronological().unwrap();
        assert_eq!(snapshot.len(), ANALYSIS_WINDOW);
        assert_eq!(snapshot[0], 1.0);
        assert_eq!(snapshot[ANALYSIS_WINDOW - 1], 999.0);
        spectrum.clear();
        assert!(spectrum.chronological().is_none());
    }

    #[test]
    fn live_tap_keeps_raw_offsets_and_downmixes_frames() {
        let tap = LiveAudioTap {
            samples: Arc::new(Mutex::new(vec![1_000, -1_000, 3_000, 1_000])),
            shape: PcmShape {
                rate: 48_000,
                channels: 2,
            },
        };
        let (samples, rate, next) = tap.read_from(0);
        assert_eq!(rate, 48_000);
        assert_eq!(next, 4);
        assert_eq!(samples[0], 0.0);
        assert!((samples[1] - 2_000.0 / i16::MAX as f32).abs() < 1e-6);
        assert_eq!(tap.read_from(9), (Vec::new(), 48_000, 9));
    }

    #[test]
    fn capture_gate_ignores_silence_and_arms_on_signal() {
        let shared = Arc::new(RecorderState::new());
        let samples = Arc::new(Mutex::new(Vec::new()));
        let sink = CaptureSink {
            samples: Arc::clone(&samples),
            shared: Arc::clone(&shared),
            channels: 1,
        };
        sink.accept(&[0_i16; 8]);
        assert!(samples.lock().is_empty());
        assert!(!shared.armed.load(Ordering::Relaxed));
        sink.accept(&[i16::MAX; 8]);
        assert_eq!(samples.lock().len(), 8);
        assert!(shared.armed.load(Ordering::Relaxed));
    }

    #[test]
    fn validation_keeps_empty_duration_energy_and_speech_order() {
        let config = ValidationConfig::default();
        assert_eq!(
            validate_recording_with_config(&recording(Vec::new(), 1_000), &config),
            Err(RecordingRejectionReason::EmptyBuffer)
        );
        assert!(matches!(
            validate_recording_with_config(&recording(vec![0; 32], 100), &config),
            Err(RecordingRejectionReason::TooShort { .. })
        ));
        assert!(matches!(
            validate_recording_with_config(&recording(vec![0; 8_000], 500), &config),
            Err(RecordingRejectionReason::TooQuiet { .. })
        ));
        assert!(
            validate_recording_with_config(&recording(vec![10_000; 8_000], 500), &config).is_ok()
        );
    }

    #[test]
    fn downmix_discards_incomplete_frames_and_averages_without_clipping() {
        assert_eq!(downmix_to_mono(&[10, 30, 99], 2), vec![20]);
        assert_eq!(downmix_to_mono(&[i16::MAX, i16::MAX], 2), vec![i16::MAX]);
        assert_eq!(downmix_to_mono(&[1, 2], 1), vec![1, 2]);
    }

    #[test]
    fn empty_processing_preserves_the_device_shape() {
        let source = PcmShape {
            rate: 44_100,
            channels: 2,
        };
        let processed = AudioProcessor::run(&[], source);
        assert!(processed.samples.is_empty());
        assert_eq!(processed.shape.rate, 44_100);
        assert_eq!(processed.shape.channels, 2);
        assert_eq!(processed.speech_percentage, None);
    }

    #[test]
    fn limiter_preserves_shape_and_caps_peak() {
        let mut signal = vec![-2.0, 0.5, 1.0];
        PeakLimiter::new(0.95).apply(&mut signal);
        assert!((signal[0] + 0.95).abs() < 1e-6);
        assert!((signal[1] - 0.2375).abs() < 1e-6);
        assert!((signal[2] - 0.475).abs() < 1e-6);
    }

    #[test]
    fn retention_policy_restores_short_gaps_and_preroll() {
        let mut voiced = vec![false; 40];
        voiced[10] = true;
        voiced[35] = true;
        let retained = RetentionMask::from_voice(&voiced).into_inner();
        assert!(retained[6]);
        assert!(retained[10]);
        assert!(retained[20]);
        assert!(retained[35]);
    }

    #[test]
    fn persisted_recording_is_canonical_mono_wav() {
        let directory = tempfile::tempdir().unwrap();
        let mut source = recording(vec![1_000, -1_000, 3_000, 1_000], 250);
        source.sample_rate = 16_000;
        source.channels = 2;
        let saved = persist_recording(directory.path().to_path_buf(), &source).unwrap();
        let reader = hound::WavReader::open(&saved.path).unwrap();
        assert_eq!(reader.spec().sample_rate, CANONICAL_RATE);
        assert_eq!(reader.spec().channels, CANONICAL_CHANNELS);
        assert_eq!(reader.into_samples::<i16>().count(), 2);
        assert_eq!(saved.duration_override_seconds, Some(2.0 / 16_000.0));
        assert_eq!(
            saved.path.parent().unwrap().file_name().unwrap(),
            source.started_at.format("%Y-%m-%d").to_string().as_str()
        );
    }

    #[test]
    fn persist_rejects_an_empty_buffer_without_creating_a_day_folder() {
        let directory = tempfile::tempdir().unwrap();
        let error = persist_recording(directory.path().to_path_buf(), &recording(Vec::new(), 400))
            .unwrap_err();
        assert_eq!(error.to_string(), "Recording buffer is empty");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    }

    #[test]
    fn malformed_multichannel_input_keeps_folder_creation_order() {
        let directory = tempfile::tempdir().unwrap();
        let mut malformed = recording(vec![100], 400);
        malformed.channels = 2;
        let error = persist_recording(directory.path().to_path_buf(), &malformed).unwrap_err();
        assert_eq!(error.to_string(), "Recording buffer is empty");
        let day = directory
            .path()
            .join(malformed.started_at.format("%Y-%m-%d").to_string());
        assert!(day.is_dir());
    }

    #[test]
    fn pending_journal_drains_all_samples_before_closing() {
        let directory = tempfile::tempdir().unwrap();
        let samples = Arc::new(Mutex::new(vec![10_i16, 20, 30]));
        let journal = PartialJournal::start(
            directory.path().to_path_buf(),
            samples,
            PcmShape {
                rate: 16_000,
                channels: 1,
            },
            instant(1_600_000_000_000),
        )
        .unwrap();
        let path = journal.close(JournalDisposition::Keep).unwrap();
        let values: Vec<i16> = hound::WavReader::open(path)
            .unwrap()
            .into_samples::<i16>()
            .map(Result::unwrap)
            .collect();
        assert_eq!(values, [10, 20, 30]);
    }

    #[test]
    fn recovery_removes_an_empty_completed_partial() {
        let directory = tempfile::tempdir().unwrap();
        let pending = directory.path().join(PENDING_DIR_NAME);
        fs::create_dir(&pending).unwrap();
        let path = pending.join("946684800000-fixture.partial.wav");
        hound::WavWriter::create(
            &path,
            wav_spec(PcmShape {
                rate: 16_000,
                channels: 1,
            }),
        )
        .unwrap()
        .finalize()
        .unwrap();
        assert!(recover_pending_recordings(directory.path().to_path_buf()).is_empty());
        assert!(!path.exists());
    }

    #[test]
    fn partial_name_parses_epoch_milliseconds_only() {
        let parsed = partial_started_at(Path::new("1700000000000-id.partial.wav")).unwrap();
        assert_eq!(parsed.timestamp_millis(), 1_700_000_000_000);
        assert!(partial_started_at(Path::new("invalid.partial.wav")).is_none());
    }

    #[test]
    fn linear_fallback_interpolates_endpoints() {
        assert_eq!(linear_resample(&[0.25], 48_000, 16_000), vec![0.25]);
        let output = linear_resample(&[0.0, 1.0], 2, 4);
        assert_eq!(output, [0.0, 0.5, 1.0, 1.0]);
    }
}
