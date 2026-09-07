use super::hover_intent::HoverIntent;
use super::{
    cursor_over_pill_window, idle_sticky, set_overlay_interactive, EVENT_PILL_HOVER,
};
use crate::{
    emit_event, recorder::RecorderManager, AppRuntime, AppState, AudioSpectrumPayload,
    EVENT_AUDIO_SPECTRUM,
};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

pub(super) const SPECTRUM_SAMPLE_COUNT: usize = 512;
pub(super) const SPECTRUM_OUTPUT_COUNT: usize = SPECTRUM_SAMPLE_COUNT / 2;
const SPECTRUM_MEMORY: f32 = 0.8;
const SPECTRUM_FLOOR_DB: f32 = -100.0;
const SPECTRUM_CEILING_DB: f32 = -30.0;

#[derive(Serialize, Clone)]
pub(super) struct PillHoverPayload {
    pub(super) hovering: bool,
}

pub(super) struct SpectrumAnalyzer {
    transform: Arc<dyn rustfft::Fft<f32>>,
    taper: Vec<f32>,
    workspace: Vec<Complex<f32>>,
    levels: Vec<f32>,
}

impl SpectrumAnalyzer {
    pub(super) fn new() -> Self {
        let mut plans = FftPlanner::<f32>::new();
        let last_sample = (SPECTRUM_SAMPLE_COUNT - 1) as f32;
        let taper = (0..SPECTRUM_SAMPLE_COUNT)
            .map(|sample| {
                let phase = 2.0 * std::f32::consts::PI * sample as f32 / last_sample;
                (1.0 - phase.cos()) / 2.0
            })
            .collect();

        Self {
            transform: plans.plan_fft_forward(SPECTRUM_SAMPLE_COUNT),
            taper,
            workspace: vec![Complex::new(0.0, 0.0); SPECTRUM_SAMPLE_COUNT],
            levels: vec![0.0; SPECTRUM_OUTPUT_COUNT],
        }
    }

    pub(super) fn frame(&mut self, samples: Option<&[f32]>) -> Vec<u8> {
        match samples {
            Some(samples) => {
                for sample_index in 0..samples.len() {
                    self.workspace[sample_index] =
                        Complex::new(samples[sample_index] * self.taper[sample_index], 0.0);
                }
                self.transform.process(&mut self.workspace);
                for bin_index in 0..self.levels.len() {
                    let amplitude = self.workspace[bin_index].norm() / SPECTRUM_SAMPLE_COUNT as f32;
                    let decibels = 20.0 * amplitude.max(1e-10).log10();
                    let scaled = ((decibels - SPECTRUM_FLOOR_DB)
                        / (SPECTRUM_CEILING_DB - SPECTRUM_FLOOR_DB))
                        .clamp(0.0, 1.0);
                    self.levels[bin_index] =
                        SPECTRUM_MEMORY * self.levels[bin_index] + (1.0 - SPECTRUM_MEMORY) * scaled;
                }
            }
            None => self
                .levels
                .iter_mut()
                .for_each(|level| *level *= SPECTRUM_MEMORY),
        }

        self.levels
            .iter()
            .map(|level| (level * 255.0).round().clamp(0.0, 255.0) as u8)
            .collect()
    }
}

pub(super) struct AudioSpectrumEmitter {
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl AudioSpectrumEmitter {
    pub(super) fn start(app: AppHandle<AppRuntime>, recorder: Arc<RecorderManager>) -> Self {
        let cancellation = Arc::new(AtomicBool::new(false));
        let worker_cancellation = Arc::clone(&cancellation);
        let worker = std::thread::spawn(move || {
            let mut analyzer = SpectrumAnalyzer::new();
            while !worker_cancellation.load(Ordering::Relaxed) {
                let samples = recorder.spectrum_snapshot();
                let payload = AudioSpectrumPayload {
                    bins: analyzer.frame(samples.as_deref()),
                };
                emit_event(&app, EVENT_AUDIO_SPECTRUM, payload);
                std::thread::sleep(Duration::from_millis(40));
            }
        });
        Self {
            stop: cancellation,
            handle: Some(worker),
        }
    }

    pub(super) fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            std::thread::spawn(move || {
                let _ = handle.join();
            });
        }
    }
}

pub(super) struct PillHoverEmitter;

impl PillHoverEmitter {
    pub(super) fn start(app: AppHandle<AppRuntime>) -> Self {
        std::thread::spawn(move || {
            let interval = Duration::from_millis(50);
            let started = Instant::now();
            let mut intent = HoverIntent::default();
            let mut last_interactive: Option<bool> = None;
            let mut last_hovering: Option<bool> = None;
            loop {
                // A drag owns the pill until the pointer is released. Polling
                // through it would collapse the pill mid-drag and, worse, hand
                // the panel back to click-through while the user still holds it.
                if app.state::<AppState>().pill().is_dragging() {
                    intent.forget_travel();
                    std::thread::sleep(interval);
                    continue;
                }
                let now_ms = started.elapsed().as_millis() as u64;
                // Mouse-query failures must fail closed. Keeping the previous
                // interactive state can leave an invisible NSPanel consuming
                // clicks after the pointer has moved away from the pill.
                let (interactive, decision) = match cursor_over_pill_window(&app) {
                    Some((interactive, hover_target, cursor)) => {
                        (interactive, intent.observe(hover_target, cursor, now_ms))
                    }
                    None => (false, intent.abandon()),
                };

                // The left floating handle must take the pointer for a drag,
                // but only the right expansion target can open the dock.
                if last_interactive != Some(interactive) {
                    last_interactive = Some(interactive);
                    set_overlay_interactive(&app, interactive);
                }
                if last_hovering != Some(decision.hovering) {
                    last_hovering = Some(decision.hovering);
                    let hovering = decision.hovering;
                    tracing::debug!(hovering, "Capture pill hover changed");
                    if let Err(error) = idle_sticky::resize_for_hover(&app, hovering) {
                        tracing::error!(
                            "Failed to resize the native Capture pill on hover: {error}"
                        );
                    }
                    app.state::<AppState>().pill().set_hovering(hovering);
                    emit_event(&app, EVENT_PILL_HOVER, PillHoverPayload { hovering });
                }
                std::thread::sleep(interval);
            }
        });
        Self
    }
}
