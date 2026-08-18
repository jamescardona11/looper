use std::path::Path;

use ort::session::builder::GraphOptimizationLevel;
use ort::session::builder::SessionBuilder;
use ort::session::Session;

use crate::{ExecutionProvider, Result};

fn base_builder() -> Result<SessionBuilder> {
    Ok(Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(inference_threads())?
        .with_inter_threads(1)?)
}

/// Past this width the ONNX graphs stop scaling and only add contention.
const MAX_INFERENCE_THREADS: usize = 8;
/// Used when the platform will not tell us how wide it is.
const FALLBACK_INFERENCE_THREADS: usize = 4;

/// Threads to give an inference session.
///
/// On a hybrid CPU, counting every logical core spills work onto efficiency
/// cores and costs throughput, so prefer the performance-core count where the
/// platform exposes it.
fn inference_threads() -> usize {
    #[cfg(target_os = "macos")]
    let detected = macos_performance_cores();
    #[cfg(not(target_os = "macos"))]
    let detected: Option<usize> = None;

    detected
        .or_else(|| std::thread::available_parallelism().ok().map(|n| n.get()))
        .unwrap_or(FALLBACK_INFERENCE_THREADS)
        .clamp(1, MAX_INFERENCE_THREADS)
}

#[cfg(target_os = "macos")]
fn macos_performance_cores() -> Option<usize> {
    let mut value: libc::c_int = 0;
    let mut size = std::mem::size_of::<libc::c_int>();
    let result = unsafe {
        libc::sysctlbyname(
            c"hw.perflevel0.physicalcpu".as_ptr(),
            &mut value as *mut libc::c_int as *mut libc::c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    (result == 0 && value > 0).then_some(value as usize)
}

pub(crate) fn create_session(path: &Path, provider: ExecutionProvider) -> Result<Session> {
    match provider {
        ExecutionProvider::Cpu => Ok(base_builder()?.commit_from_file(path)?),
        ExecutionProvider::DirectMl => create_direct_ml_session(path),
    }
}

#[cfg(feature = "directml")]
fn create_direct_ml_session(path: &Path) -> Result<Session> {
    use ort::ep::{DirectML, CPU};

    let mut builder = base_builder()?
        .with_parallel_execution(false)?
        .with_memory_pattern(false)?
        .with_execution_providers([DirectML::default().build(), CPU::default().build()])?;
    Ok(builder.commit_from_file(path)?)
}

#[cfg(not(feature = "directml"))]
fn create_direct_ml_session(_path: &Path) -> Result<Session> {
    Err(crate::Error::Config(
        "DirectML support requires the `directml` crate feature".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::inference_threads;

    #[test]
    fn inference_threads_stay_within_the_tuned_range() {
        assert!((1..=8).contains(&inference_threads()));
    }
}
