//! Resampling is verified against synthesised signals rather than shipped audio,
//! so the suite runs anywhere without a fixture corpus.

use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::task::{Context, Poll};

use futures_util::{Stream, StreamExt};
use looper_audio_interface::AsyncSource;

use super::ResampleExt;

const BLOCK: usize = 128;

/// A finite source whose rate can be swapped mid-stream, which is what happens
/// when the user changes output device during a recording.
struct Signal {
    samples: std::vec::IntoIter<f32>,
    rate: Arc<AtomicU32>,
    switch_after: Option<(usize, u32)>,
    emitted: usize,
}

impl Signal {
    fn tone(rate: u32, count: usize) -> Self {
        let step = std::f32::consts::TAU * 440.0 / rate as f32;
        let samples: Vec<f32> = (0..count).map(|i| (i as f32 * step).sin()).collect();
        Self {
            samples: samples.into_iter(),
            rate: Arc::new(AtomicU32::new(rate)),
            switch_after: None,
            emitted: 0,
        }
    }

    fn switching_to(mut self, rate: u32, after: usize) -> Self {
        self.switch_after = Some((after, rate));
        self
    }
}

impl Stream for Signal {
    type Item = f32;

    fn poll_next(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<f32>> {
        let next = self.samples.next();
        if next.is_some() {
            self.emitted += 1;
            if let Some((after, rate)) = self.switch_after
                && self.emitted == after
            {
                self.rate.store(rate, Ordering::Relaxed);
            }
        }
        Poll::Ready(next)
    }
}

impl AsyncSource for Signal {
    fn as_stream(&mut self) -> impl Stream<Item = f32> + '_ {
        self
    }

    fn sample_rate(&self) -> u32 {
        self.rate.load(Ordering::Relaxed)
    }
}

async fn collect_chunks(source: Signal, target: u32, chunk: usize) -> Vec<Vec<f32>> {
    source
        .resampled_chunks(target, chunk)
        .expect("the resampler should build")
        .map(|chunk| chunk.expect("resampling should not fail"))
        .collect()
        .await
}

#[tokio::test]
async fn matching_rates_pass_samples_through_untouched() {
    let input: Vec<f32> = {
        let step = std::f32::consts::TAU * 440.0 / 16_000.0;
        (0..512).map(|i| (i as f32 * step).sin()).collect()
    };

    let chunks = collect_chunks(Signal::tone(16_000, 512), 16_000, BLOCK).await;
    let flat: Vec<f32> = chunks.into_iter().flatten().collect();

    assert_eq!(flat.len(), input.len());
    for (got, want) in flat.iter().zip(input.iter()) {
        assert!((got - want).abs() < 1e-6, "passthrough altered a sample");
    }
}

#[tokio::test]
async fn downsampling_reduces_the_sample_count_proportionally() {
    let chunks = collect_chunks(Signal::tone(48_000, 4_800), 16_000, BLOCK).await;
    let total: usize = chunks.iter().map(Vec::len).sum();

    // 48k -> 16k is a third; allow a block of slack for filter latency.
    let expected = 4_800 / 3;
    assert!(
        total.abs_diff(expected) <= BLOCK,
        "expected about {expected} samples, produced {total}"
    );
}

#[tokio::test]
async fn upsampling_increases_the_sample_count_proportionally() {
    let chunks = collect_chunks(Signal::tone(8_000, 1_600), 16_000, BLOCK).await;
    let total: usize = chunks.iter().map(Vec::len).sum();

    let expected = 1_600 * 2;
    assert!(
        total.abs_diff(expected) <= BLOCK,
        "expected about {expected} samples, produced {total}"
    );
}

#[tokio::test]
async fn every_chunk_but_the_last_is_full() {
    let chunks = collect_chunks(Signal::tone(44_100, 8_820), 16_000, BLOCK).await;

    assert!(chunks.len() > 1, "the test needs more than one chunk");
    for chunk in &chunks[..chunks.len() - 1] {
        assert_eq!(chunk.len(), BLOCK, "a mid-stream chunk was short");
    }
    assert!(!chunks.last().unwrap().is_empty());
}

#[tokio::test]
async fn a_rate_change_mid_stream_keeps_producing_audio() {
    let source = Signal::tone(48_000, 4_800).switching_to(16_000, 2_400);
    let chunks = collect_chunks(source, 16_000, BLOCK).await;
    let total: usize = chunks.iter().map(Vec::len).sum();

    // First half at 48k thirds down to 800; the second half already matches.
    let expected = 2_400 / 3 + 2_400;
    assert!(
        total.abs_diff(expected) <= BLOCK * 2,
        "expected about {expected} samples across the switch, produced {total}"
    );
}

#[tokio::test]
async fn the_sample_adapter_flattens_the_same_audio() {
    let chunked: Vec<f32> = collect_chunks(Signal::tone(48_000, 2_400), 16_000, BLOCK)
        .await
        .into_iter()
        .flatten()
        .collect();

    let flat: Vec<f32> = Signal::tone(48_000, 2_400)
        .resampled(16_000, BLOCK)
        .expect("the resampler should build")
        .collect()
        .await;

    assert_eq!(flat.len(), chunked.len());
    for (got, want) in flat.iter().zip(chunked.iter()) {
        assert!((got - want).abs() < 1e-6, "the two adapters disagreed");
    }
}
