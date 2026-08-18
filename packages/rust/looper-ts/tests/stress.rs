use std::{path::PathBuf, time::Instant};

use looper_ts::{
    AudioInput, Engine, ExecutionProvider, ModelKind, TimestampMode, TranscribeOptions,
};

const CYCLES: usize = 100;
const SAMPLE_RATE: u32 = 16_000;
const SILENCE_SECONDS: usize = 2;
const SECOND_HALF_START: usize = CYCLES / 2;
const RSS_WINDOW_SIZE: usize = 10;
const MATERIAL_GROWTH_FLOOR_KIB: u64 = 64 * 1024;
const WINDOW_NOISE_KIB: u64 = 1024;

#[test]
#[ignore = "requires LOOPER_PARAKEET_MODEL_DIR and runs 100 real model lifecycle cycles"]
fn parakeet_load_transcribe_drop_100_cycles_has_no_sustained_rss_growth() {
    let model_dir = std::env::var_os("LOOPER_PARAKEET_MODEL_DIR")
        .map(PathBuf::from)
        .expect("set LOOPER_PARAKEET_MODEL_DIR to the Parakeet INT8 model directory");
    assert!(
        model_dir.is_dir(),
        "Parakeet model directory does not exist: {}",
        model_dir.display()
    );

    let silence = vec![0.0; SAMPLE_RATE as usize * SILENCE_SECONDS];
    let options = TranscribeOptions {
        language: None,
        timestamps: TimestampMode::None,
    };
    let started = Instant::now();
    let mut rss_samples_kib = Vec::with_capacity(CYCLES);

    for cycle in 0..CYCLES {
        let mut engine = Engine::load(
            ModelKind::ParakeetTdtInt8,
            &model_dir,
            ExecutionProvider::Cpu,
        )
        .unwrap_or_else(|error| panic!("cycle {} failed to load: {error}", cycle + 1));

        let transcript = engine
            .transcribe(
                AudioInput::PcmF32 {
                    samples: silence.clone(),
                    sample_rate: SAMPLE_RATE,
                },
                &options,
            )
            .unwrap_or_else(|error| panic!("cycle {} failed to transcribe: {error}", cycle + 1));
        assert_eq!(
            transcript.duration_ms,
            (SILENCE_SECONDS * 1_000) as u128,
            "cycle {} returned an unexpected duration",
            cycle + 1
        );

        drop(engine);
        let rss_kib = current_rss_kib()
            .unwrap_or_else(|error| panic!("cycle {} could not measure RSS: {error}", cycle + 1));
        rss_samples_kib.push(rss_kib);

        if (cycle + 1) % RSS_WINDOW_SIZE == 0 {
            eprintln!(
                "cycle={} elapsed_seconds={:.3} rss_mib={:.1}",
                cycle + 1,
                started.elapsed().as_secs_f64(),
                kib_to_mib(rss_kib),
            );
        }
    }

    // Inspect only cycles 51-100, after allocator and runtime initialization.
    // Growth is "sustained material" when the last 10-cycle median exceeds the
    // first by max(64 MiB, 5%) and at least 3 of 4 window transitions rise by
    // more than 1 MiB. A single retained allocation or RSS spike cannot fail it.
    let second_half = &rss_samples_kib[SECOND_HALF_START..];
    let window_medians_kib: Vec<u64> = second_half
        .chunks_exact(RSS_WINDOW_SIZE)
        .map(median)
        .collect();
    assert_eq!(window_medians_kib.len(), 5);

    let first_window_kib = window_medians_kib[0];
    let last_window_kib = *window_medians_kib.last().expect("five RSS windows");
    let material_threshold_kib =
        MATERIAL_GROWTH_FLOOR_KIB.max(first_window_kib.saturating_mul(5) / 100);
    let net_growth_kib = last_window_kib.saturating_sub(first_window_kib);
    let rising_transitions = window_medians_kib
        .windows(2)
        .filter(|pair| pair[1] > pair[0].saturating_add(WINDOW_NOISE_KIB))
        .count();

    let minimum_rss_kib = *rss_samples_kib.iter().min().expect("100 RSS samples");
    let maximum_rss_kib = *rss_samples_kib.iter().max().expect("100 RSS samples");
    eprintln!(
        "cycles={CYCLES} elapsed_seconds={:.3} rss_first_mib={:.1} rss_last_mib={:.1} \
         rss_min_mib={:.1} rss_max_mib={:.1} second_half_window_medians_mib={:?} \
         net_growth_mib={:.1} material_threshold_mib={:.1} rising_transitions={rising_transitions}",
        started.elapsed().as_secs_f64(),
        kib_to_mib(rss_samples_kib[0]),
        kib_to_mib(*rss_samples_kib.last().expect("100 RSS samples")),
        kib_to_mib(minimum_rss_kib),
        kib_to_mib(maximum_rss_kib),
        window_medians_kib
            .iter()
            .copied()
            .map(kib_to_mib)
            .collect::<Vec<_>>(),
        kib_to_mib(net_growth_kib),
        kib_to_mib(material_threshold_kib),
    );

    assert!(
        net_growth_kib <= material_threshold_kib || rising_transitions < 3,
        "sustained material RSS growth detected: second-half window medians were \
         {:?} KiB (net {} KiB, threshold {} KiB, {rising_transitions}/4 rising transitions)",
        window_medians_kib,
        net_growth_kib,
        material_threshold_kib,
    );
}

fn median(values: &[u64]) -> u64 {
    assert!(!values.is_empty(), "cannot calculate an empty median");
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let middle = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        sorted[middle - 1].saturating_add(sorted[middle]) / 2
    } else {
        sorted[middle]
    }
}

fn kib_to_mib(kib: u64) -> f64 {
    kib as f64 / 1024.0
}

fn current_rss_kib() -> Result<u64, String> {
    #[cfg(target_os = "linux")]
    {
        let status = std::fs::read_to_string("/proc/self/status")
            .map_err(|error| format!("failed to read /proc/self/status: {error}"))?;
        let rss_line = status
            .lines()
            .find(|line| line.starts_with("VmRSS:"))
            .ok_or_else(|| "VmRSS is absent from /proc/self/status".to_owned())?;
        rss_line
            .split_whitespace()
            .nth(1)
            .ok_or_else(|| format!("malformed VmRSS line: {rss_line}"))?
            .parse::<u64>()
            .map_err(|error| format!("invalid VmRSS value in {rss_line:?}: {error}"))
    }

    #[cfg(target_os = "macos")]
    {
        let pid = std::process::id().to_string();
        let output = std::process::Command::new("ps")
            .args(["-o", "rss=", "-p", &pid])
            .output()
            .map_err(|error| format!("failed to execute ps: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "ps exited with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u64>()
            .map_err(|error| format!("invalid ps RSS output: {error}"))
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Err("RSS measurement is implemented only for macOS and Linux".to_owned())
    }
}
