//! Microphone capture.
//!
//! `cpal`'s stream handle is `!Send`, so it cannot simply be parked in a struct
//! that crosses threads: the stream is owned by a dedicated thread that outlives
//! nothing but itself. That thread reports whether the device opened, then
//! blocks until the consumer drops, which is the signal to tear the stream down.
//!
//! The capture callback runs on a real-time thread. It downmixes into a scratch
//! buffer it already owns and pushes into a lock-free ring; it never allocates.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};

use cpal::{
    SizedSample,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use dasp::sample::ToSample;
use futures_util::Stream;
use futures_util::task::AtomicWaker;
use ringbuf::{HeapCons, HeapProd, HeapRb, traits::Split};

use crate::AsyncSource;
use crate::async_ring::RingbufAsyncReader;

const READ_CHUNK: usize = 256;
const RING_CAPACITY: usize = READ_CHUNK * 256;
const UNNAMED_DEVICE: &str = "Unknown Microphone";

/// Looper's own system-audio tap registers as an input device. Capturing it as
/// a microphone would feed playback straight back into the recording, so it is
/// filtered out of every enumeration.
fn is_own_tap(name: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        name.contains(crate::TAP_DEVICE_NAME)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
        false
    }
}

fn describe(device: &cpal::Device) -> String {
    device
        .description()
        .map(|description| description.name().to_string())
        .unwrap_or_else(|_| UNNAMED_DEVICE.to_string())
}

fn usable_inputs(host: &cpal::Host) -> Vec<cpal::Device> {
    host.input_devices()
        .map_err(|error| {
            tracing::error!(error = %error, "could not enumerate input devices");
            error
        })
        .map(|devices| {
            devices
                .filter(|device| !is_own_tap(&describe(device)))
                .collect()
        })
        .unwrap_or_default()
}

pub struct MicInput {
    _host: cpal::Host,
    device: cpal::Device,
    config: cpal::SupportedStreamConfig,
}

impl MicInput {
    pub fn device_name(&self) -> String {
        describe(&self.device)
    }

    pub fn list_devices() -> Vec<String> {
        usable_inputs(&cpal::default_host())
            .iter()
            .map(describe)
            .collect()
    }

    /// Open `device_name`, falling back to the system default and then to any
    /// other usable input, so an unplugged device does not stop a recording.
    pub fn new(device_name: Option<String>) -> Result<Self, crate::Error> {
        let host = cpal::default_host();
        let candidates = usable_inputs(&host);
        let default = host
            .default_input_device()
            .filter(|device| !is_own_tap(&describe(device)));

        let requested = device_name.and_then(|wanted| {
            candidates
                .iter()
                .find(|device| describe(device) == wanted)
                .cloned()
        });

        let device = requested
            .or(default)
            .or_else(|| candidates.into_iter().next())
            .ok_or(crate::Error::NoInputDevice)?;

        let name = describe(&device);
        let config = device.default_input_config().map_err(|error| {
            tracing::error!(error = %error, device = name, "no usable input configuration");
            crate::Error::MicOpenFailed
        })?;

        tracing::info!(
            looper.audio.sample_rate_hz = ?config.sample_rate(),
            device = name,
            "microphone ready"
        );

        Ok(Self {
            _host: host,
            device,
            config,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.config.sample_rate()
    }

    /// Start capturing. Fails if the device refuses the stream, rather than
    /// handing back a stream that silently yields nothing.
    pub fn stream(&self) -> Result<MicStream, crate::Error> {
        let (producer, consumer) = HeapRb::<f32>::new(RING_CAPACITY).split();
        let waker = Arc::new(AtomicWaker::new());
        let wake_pending = Arc::new(AtomicBool::new(false));
        let alive = Arc::new(AtomicBool::new(true));
        let dropped = Arc::new(AtomicUsize::new(0));

        let wiring = CaptureWiring {
            producer,
            waker: waker.clone(),
            wake_pending: wake_pending.clone(),
            dropped: dropped.clone(),
            alive: alive.clone(),
        };

        let (shutdown_tx, shutdown_rx) = channel();
        let (ready_tx, ready_rx) = channel();
        spawn_capture_thread(
            self.device.clone(),
            self.config.clone(),
            wiring,
            ready_tx,
            shutdown_rx,
        );

        // The thread owns the `!Send` stream, so startup success has to travel
        // back over a channel. A closed channel means the thread died early.
        match ready_rx.recv() {
            Ok(Ok(())) => {}
            Ok(Err(error)) => return Err(error),
            Err(_) => return Err(crate::Error::MicStreamSetupFailed),
        }

        Ok(MicStream {
            shutdown_tx,
            config: self.config.clone(),
            reader: RingbufAsyncReader::new(consumer, waker, wake_pending, vec![0.0f32; READ_CHUNK])
                .with_alive(alive)
                .with_dropped_samples(dropped, "mic_samples_dropped"),
        })
    }
}

/// Everything the capture callback needs, bundled so the per-format dispatch
/// stays a single line each.
struct CaptureWiring {
    producer: HeapProd<f32>,
    waker: Arc<AtomicWaker>,
    wake_pending: Arc<AtomicBool>,
    dropped: Arc<AtomicUsize>,
    alive: Arc<AtomicBool>,
}

fn spawn_capture_thread(
    device: cpal::Device,
    config: cpal::SupportedStreamConfig,
    wiring: CaptureWiring,
    ready: Sender<Result<(), crate::Error>>,
    shutdown: Receiver<()>,
) {
    std::thread::spawn(move || {
        let waker = wiring.waker.clone();
        let alive = wiring.alive.clone();

        let stream = match open_stream(&device, &config, wiring) {
            Ok(stream) => stream,
            Err(error) => {
                alive.store(false, Ordering::Release);
                let _ = ready.send(Err(error));
                waker.wake();
                return;
            }
        };

        let _ = ready.send(Ok(()));

        // Park until the consumer drops; dropping the stream stops the device.
        let _ = shutdown.recv();
        alive.store(false, Ordering::Release);
        waker.wake();
        drop(stream);
    });
}

fn open_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    wiring: CaptureWiring,
) -> Result<cpal::Stream, crate::Error> {
    use cpal::SampleFormat::{F32, I8, I16, I32};

    let built = match config.sample_format() {
        I8 => build_input::<i8>(device, config, wiring),
        I16 => build_input::<i16>(device, config, wiring),
        I32 => build_input::<i32>(device, config, wiring),
        F32 => build_input::<f32>(device, config, wiring),
        other => {
            tracing::error!(sample_format = ?other, "input format not supported");
            return Err(crate::Error::MicStreamSetupFailed);
        }
    };

    let stream = built.map_err(|error| {
        tracing::error!(error = %error, "could not build the input stream");
        crate::Error::MicStreamSetupFailed
    })?;

    stream.play().map_err(|error| {
        tracing::error!(error = %error, "could not start the input stream");
        crate::Error::MicStreamSetupFailed
    })?;

    Ok(stream)
}

fn build_input<S>(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    wiring: CaptureWiring,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    S: ToSample<f32> + SizedSample,
{
    let CaptureWiring {
        mut producer,
        waker,
        wake_pending,
        dropped,
        alive,
    } = wiring;

    let channels = config.channels() as usize;
    let mut scratch = vec![0.0f32; crate::rt_ring::DEFAULT_SCRATCH_LEN];
    let waker_on_error = waker.clone();

    device.build_input_stream::<S, _, _>(
        &config.config(),
        move |frames: &[S], _timing: &_| {
            let stats = crate::rt_ring::push_interleaved_downmix_to_mono_ringbuf(
                frames,
                channels,
                &mut scratch,
                &mut producer,
            );

            if stats.dropped > 0 {
                dropped.fetch_add(stats.dropped, Ordering::Relaxed);
            }
            if stats.pushed > 0 && wake_pending.swap(false, Ordering::AcqRel) {
                waker.wake();
            }
        },
        move |error| {
            tracing::error!(error = %error, "microphone stream failed");
            alive.store(false, Ordering::Release);
            waker_on_error.wake();
        },
        None,
    )
}

pub struct MicStream {
    shutdown_tx: Sender<()>,
    config: cpal::SupportedStreamConfig,
    reader: RingbufAsyncReader<HeapCons<f32>>,
}

impl Drop for MicStream {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(());
    }
}

impl Stream for MicStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.as_mut().get_mut().reader.poll_next_sample(cx).poll
    }
}

impl AsyncSource for MicStream {
    fn as_stream(&mut self) -> impl Stream<Item = f32> + '_ {
        self
    }

    fn sample_rate(&self) -> u32 {
        self.config.sample_rate()
    }
}
