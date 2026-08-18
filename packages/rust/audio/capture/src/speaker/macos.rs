//! System-audio capture on macOS.
//!
//! macOS 14.4 exposes *process taps*: a virtual input fed with whatever the
//! system is about to play. Looper wraps one global mono tap in a private
//! aggregate device and runs a Core Audio IOProc against it.
//!
//! The IOProc executes on a real-time thread, so everything it touches is
//! pre-allocated: it converts into a scratch buffer it already owns and hands
//! samples to the async side through a lock-free ring. It never allocates,
//! locks, or logs.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::task::Poll;

use anyhow::{Context as _, Result, anyhow};
use futures_util::Stream;
use futures_util::task::AtomicWaker;
use looper_audio_interface::AsyncSource;
use looper_audio_utils::{pcm_f64_to_f32, pcm_i16_to_f32, pcm_i32_to_f32};
use pin_project::pin_project;
use ringbuf::{HeapCons, HeapProd, HeapRb, traits::Split};

use super::{BUFFER_SIZE, CHUNK_SIZE};
use crate::async_ring::RingbufAsyncReader;
use ca::aggregate_device_keys as agg_keys;
use cidre::{arc, av, cat, cf, core_audio as ca, ns, os};

/// Polls between re-reading the tap's negotiated sample rate. Switching output
/// device can renegotiate it, but asking Core Audio is not free, so only ask
/// while the ring is drained — mid-stream the rate cannot have changed for
/// samples already captured.
const RATE_RECHECK_POLLS: u32 = 128;

type AggregateDesc = arc::Retained<cf::DictionaryOf<cf::String, cf::Type>>;

/// Moves one IOProc buffer into the ring, converting from the tap's native
/// sample format. Resolved once at setup so the real-time path is a single
/// indirect call rather than a format match per callback.
type BufferForwarder = fn(&cat::AudioBuf, &mut TapSink);

pub struct SpeakerInput {
    tap: ca::TapGuard,
    aggregate: AggregateDesc,
}

impl SpeakerInput {
    pub fn new() -> Result<Self> {
        let tap = ca::TapDesc::with_mono_global_tap_excluding_processes(&ns::Array::new())
            .create_process_tap()
            .context("creating the system audio tap")?;

        let uid = tap
            .uid()
            .map_err(|status| anyhow!("the system audio tap has no UID: {status:?}"))?;
        let aggregate = describe_aggregate_device(&uid);

        Ok(Self { tap, aggregate })
    }

    pub fn sample_rate(&self) -> u32 {
        self.negotiated_rate().unwrap_or_default()
    }

    fn negotiated_rate(&self) -> Result<u32> {
        let asbd = self
            .tap
            .asbd()
            .map_err(|status| anyhow!("reading the tap stream format: {status:?}"))?;
        Ok(asbd.sample_rate as u32)
    }

    pub fn stream(self) -> Result<SpeakerStream> {
        let asbd = self
            .tap
            .asbd()
            .map_err(|status| anyhow!("reading the tap stream format: {status:?}"))?;
        let rate = asbd.sample_rate as u32;

        let format = av::AudioFormat::with_asbd(&asbd)
            .ok_or_else(|| anyhow!("the tap reported a stream format we cannot decode"))?;
        let forward = forwarder_for(format.common_format()).ok_or_else(|| {
            anyhow!(
                "the tap negotiated an unsupported sample format: {:?}",
                format.common_format()
            )
        })?;

        let (producer, consumer) = HeapRb::<f32>::new(BUFFER_SIZE).split();
        let waker = Arc::new(AtomicWaker::new());
        let wake_pending = Arc::new(AtomicBool::new(false));
        let dropped = Arc::new(AtomicUsize::new(0));

        let mut sink = Box::new(TapSink {
            forward,
            producer,
            waker: waker.clone(),
            wake_pending: wake_pending.clone(),
            dropped: dropped.clone(),
            scratch: vec![0.0f32; crate::rt_ring::DEFAULT_SCRATCH_LEN],
        });

        let device = self.start_capture(&mut sink)?;
        tracing::info!(sample_rate = rate, "system audio tap started");

        Ok(SpeakerStream {
            reader: RingbufAsyncReader::new(consumer, waker, wake_pending, vec![0.0f32; CHUNK_SIZE])
                .with_dropped_samples(dropped, "samples_dropped"),
            rate: RateTracker::new(rate),
            _device: device,
            _sink: sink,
            tap: self.tap,
        })
    }

    fn start_capture(
        &self,
        sink: &mut Box<TapSink>,
    ) -> Result<ca::hardware::StartedDevice<ca::AggregateDevice>> {
        let device = ca::AggregateDevice::with_desc(&self.aggregate)
            .context("creating the aggregate device that hosts the tap")?;
        let proc_id = device
            .create_io_proc_id(on_audio_ready, Some(sink))
            .context("installing the capture callback")?;
        ca::device_start(device, Some(proc_id)).context("starting the aggregate device")
    }
}

/// A private, auto-starting aggregate device whose only sub-device is the tap.
/// Private keeps it out of the user's Sound settings.
fn describe_aggregate_device(tap_uid: &cf::String) -> AggregateDesc {
    let sub_device = cf::DictionaryOf::with_keys_values(
        &[ca::sub_device_keys::uid()],
        &[tap_uid.as_type_ref()],
    );

    cf::DictionaryOf::with_keys_values(
        &[
            agg_keys::is_private(),
            agg_keys::tap_auto_start(),
            agg_keys::name(),
            agg_keys::uid(),
            agg_keys::tap_list(),
        ],
        &[
            cf::Boolean::value_true().as_type_ref(),
            cf::Boolean::value_false(),
            cf::String::from_str(crate::TAP_DEVICE_NAME).as_ref(),
            &cf::Uuid::new().to_cf_string(),
            &cf::ArrayOf::from_slice(&[sub_device.as_ref()]),
        ],
    )
}

/// Real-time side state. Owned by the stream, borrowed by the IOProc.
struct TapSink {
    forward: BufferForwarder,
    producer: HeapProd<f32>,
    waker: Arc<AtomicWaker>,
    wake_pending: Arc<AtomicBool>,
    dropped: Arc<AtomicUsize>,
    scratch: Vec<f32>,
}

impl TapSink {
    /// Account for a completed push and wake the consumer if it parked.
    fn settle(&mut self, stats: crate::rt_ring::PushStats) {
        if stats.dropped > 0 {
            self.dropped.fetch_add(stats.dropped, Ordering::Relaxed);
        }
        if stats.pushed > 0 && self.wake_pending.swap(false, Ordering::AcqRel) {
            self.waker.wake();
        }
    }
}

extern "C" fn on_audio_ready(
    _device: ca::Device,
    _now: &cat::AudioTimeStamp,
    input: &cat::AudioBufList<1>,
    _input_time: &cat::AudioTimeStamp,
    _output: &mut cat::AudioBufList<1>,
    _output_time: &cat::AudioTimeStamp,
    sink: Option<&mut TapSink>,
) -> os::Status {
    if let Some(sink) = sink {
        let buffer = &input.buffers[0];
        if buffer.data_bytes_size > 0 && !buffer.data.is_null() {
            (sink.forward)(buffer, sink);
        }
    }
    os::Status::NO_ERR
}

fn forwarder_for(format: av::audio::CommonFormat) -> Option<BufferForwarder> {
    match format {
        av::audio::CommonFormat::PcmF32 => Some(forward_f32),
        av::audio::CommonFormat::PcmF64 => Some(forward_f64),
        av::audio::CommonFormat::PcmI32 => Some(forward_i32),
        av::audio::CommonFormat::PcmI16 => Some(forward_i16),
        _ => None,
    }
}

fn forward_f32(buffer: &cat::AudioBuf, sink: &mut TapSink) {
    let Some(frames) = frames_of::<f32>(buffer) else {
        return;
    };
    let stats = crate::rt_ring::push_f32_to_ringbuf(frames, &mut sink.producer);
    sink.settle(stats);
}

fn forward_f64(buffer: &cat::AudioBuf, sink: &mut TapSink) {
    forward_converted::<f64>(buffer, sink, pcm_f64_to_f32);
}

fn forward_i32(buffer: &cat::AudioBuf, sink: &mut TapSink) {
    forward_converted::<i32>(buffer, sink, pcm_i32_to_f32);
}

fn forward_i16(buffer: &cat::AudioBuf, sink: &mut TapSink) {
    forward_converted::<i16>(buffer, sink, pcm_i16_to_f32);
}

fn forward_converted<T: Copy + 'static>(
    buffer: &cat::AudioBuf,
    sink: &mut TapSink,
    convert: impl FnMut(T) -> f32,
) {
    let Some(frames) = frames_of::<T>(buffer) else {
        return;
    };
    let stats = crate::rt_ring::convert_and_push_to_ringbuf(
        frames,
        &mut sink.scratch,
        &mut sink.producer,
        convert,
    );
    sink.settle(stats);
}

/// Reinterpret an IOProc buffer as `T` frames.
///
/// Core Audio hands us a raw pointer with a byte count; this is the one place
/// that has to trust it. Bail out on a misaligned or empty buffer rather than
/// constructing an unsound slice.
fn frames_of<T: Copy>(buffer: &cat::AudioBuf) -> Option<&[T]> {
    let bytes = buffer.data_bytes_size as usize;
    let count = bytes / std::mem::size_of::<T>();
    let data = buffer.data as *const T;

    if count == 0 || data.is_null() || !(data as usize).is_multiple_of(std::mem::align_of::<T>()) {
        return None;
    }

    // SAFETY: Core Audio guarantees `data` points to `data_bytes_size` readable
    // bytes for the duration of the callback, and we just checked alignment.
    Some(unsafe { std::slice::from_raw_parts(data, count) })
}

/// Tracks the tap's sample rate across output-device changes.
///
/// `reported` lags `negotiated` on purpose: samples already in the ring were
/// captured at the old rate, so the consumer only adopts a new rate once the
/// ring hands over a fresh chunk.
struct RateTracker {
    negotiated: u32,
    reported: u32,
    polls_since_recheck: u32,
}

impl RateTracker {
    fn new(rate: u32) -> Self {
        Self {
            negotiated: rate,
            reported: rate,
            polls_since_recheck: 0,
        }
    }

    fn due_for_recheck(&mut self) -> bool {
        self.polls_since_recheck = self.polls_since_recheck.wrapping_add(1);
        self.polls_since_recheck.is_multiple_of(RATE_RECHECK_POLLS)
    }
}

#[pin_project(PinnedDrop)]
pub struct SpeakerStream {
    reader: RingbufAsyncReader<HeapCons<f32>>,
    rate: RateTracker,
    _device: ca::hardware::StartedDevice<ca::AggregateDevice>,
    _sink: Box<TapSink>,
    tap: ca::TapGuard,
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.rate.reported
    }
}

impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        let this = self.as_mut().get_mut();

        if !this.reader.has_buffered_samples()
            && this.rate.due_for_recheck()
            && let Ok(asbd) = this.tap.asbd()
        {
            this.rate.negotiated = asbd.sample_rate as u32;
        }

        let polled = this.reader.poll_next_sample(cx);
        if polled.did_pop_chunk {
            this.rate.reported = this.rate.negotiated;
        }

        polled.poll
    }
}

impl AsyncSource for SpeakerStream {
    fn as_stream(&mut self) -> impl Stream<Item = f32> + '_ {
        self
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate()
    }
}

#[pin_project::pinned_drop]
impl PinnedDrop for SpeakerStream {
    fn drop(self: std::pin::Pin<&mut Self>) {
        tracing::debug!("system audio tap stopping");
    }
}
