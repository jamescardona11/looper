use std::{
    env, fs,
    io::{BufRead, BufReader, ErrorKind},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    thread,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use symphonia::core::{
    formats::{probe::Hint, FormatOptions, TrackType},
    io::MediaSourceStream,
    meta::MetadataOptions,
    units::Timestamp,
};
use tokio_util::sync::CancellationToken;

use crate::library::types::{cancelled_error, TARGET_SAMPLE_RATE};

const DENOISE_FILTER: &str = "afftdn=nr=10:nf=-80:tn=1";
const CONVERSION_POLL: Duration = Duration::from_millis(200);
const DENOISE_POLL: Duration = Duration::from_millis(100);

pub(crate) fn find_binary_in_path(file_name: &str, fallback_dirs: &[&str]) -> Option<PathBuf> {
    let shell_candidates = env::var_os("PATH")
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>());
    shell_candidates
        .chain(fallback_dirs.iter().map(PathBuf::from))
        .map(|directory| directory.join(file_name))
        .find(|candidate| candidate.is_file())
}

pub(super) fn find_ffmpeg_in_path() -> Option<PathBuf> {
    find_tool("ffmpeg")
}

fn find_ffprobe_in_path() -> Option<PathBuf> {
    find_tool("ffprobe")
}

fn find_tool(base_name: &str) -> Option<PathBuf> {
    let file_name = if cfg!(target_os = "windows") {
        format!("{base_name}.exe")
    } else {
        base_name.to_owned()
    };
    find_binary_in_path(&file_name, tool_fallback_directories())
}

fn tool_fallback_directories() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &[
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/opt/local/bin",
            "/usr/bin",
        ]
    } else {
        &["/usr/local/bin", "/usr/bin"]
    }
}

pub(crate) fn probe_media_duration_ms(path: &Path) -> Option<u64> {
    if let Some(ffprobe) = find_ffprobe_in_path() {
        let output = Command::new(ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nk=1:nw=1",
            ])
            .arg(path)
            .output()
            .ok()?;
        if output.status.success() {
            let seconds = String::from_utf8_lossy(&output.stdout)
                .trim()
                .parse::<f64>()
                .ok()?;
            if seconds.is_finite() && seconds > 0.0 {
                return Some((seconds * 1_000.0) as u64);
            }
        }
    }
    probe_with_symphonia(path)
}

fn probe_with_symphonia(path: &Path) -> Option<u64> {
    let file = fs::File::open(path).ok()?;
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let format = symphonia::default::get_probe()
        .probe(
            &hint,
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .ok()?;
    let track = format.default_track(TrackType::Audio).or_else(|| {
        format.tracks().iter().find(|track| {
            track
                .codec_params
                .as_ref()
                .and_then(|parameters| parameters.audio())
                .is_some_and(|audio| audio.sample_rate.is_some() && audio.channels.is_some())
        })
    })?;
    let timestamp = Timestamp::new(track.num_frames? as i64);
    let milliseconds = track.time_base?.calc_time(timestamp)?.as_millis();
    (milliseconds > 0).then_some(milliseconds as u64)
}

pub(super) fn convert_with_ffmpeg(
    ffmpeg: &Path,
    input: &Path,
    output: &Path,
    token: Option<&CancellationToken>,
    duration_ms: Option<u64>,
    progress: Option<&mut dyn FnMut(f32)>,
) -> Result<()> {
    ensure_not_cancelled(token)?;
    let conversion = FfmpegConversion {
        binary: ffmpeg,
        input,
        output,
    };
    match (duration_ms, progress) {
        (Some(duration), Some(callback)) => conversion.run_with_progress(token, duration, callback),
        _ => conversion.run_polled(token),
    }
}

struct FfmpegConversion<'a> {
    binary: &'a Path,
    input: &'a Path,
    output: &'a Path,
}

impl FfmpegConversion<'_> {
    fn command(&self, report_progress: bool) -> Command {
        let mut command = Command::new(self.binary);
        command.args(["-y", "-nostdin", "-loglevel", "error"]);
        if report_progress {
            command.args(["-progress", "pipe:1", "-nostats"]);
        }
        command
            .arg("-i")
            .arg(self.input)
            .args(["-vn", "-acodec", "pcm_s16le", "-ar"])
            .arg(TARGET_SAMPLE_RATE.to_string())
            .args(["-ac", "1"])
            .arg(self.output);
        command
    }

    fn run_with_progress(
        &self,
        token: Option<&CancellationToken>,
        duration_ms: u64,
        callback: &mut dyn FnMut(f32),
    ) -> Result<()> {
        let mut command = self.command(true);
        command.stdout(Stdio::piped()).stderr(Stdio::null());
        let mut child = spawn_conversion(&mut command)?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("Failed to read ffmpeg progress output"))?;
        let mut lines = BufReader::new(stdout);
        let denominator = duration_ms.max(1);
        let mut last_progress = 0.0f32;
        let mut line = String::new();

        loop {
            if cancellation_requested(token) {
                terminate_cancelled(&mut child, self.output);
                return Err(cancelled_error());
            }
            line.clear();
            let bytes = lines
                .read_line(&mut line)
                .map_err(|error| anyhow!("Failed to read ffmpeg progress output: {error}"))?;
            if bytes == 0 {
                break;
            }
            if let Some(elapsed_ms) = progress_timestamp_ms(line.trim()) {
                let value = (elapsed_ms as f64 / denominator as f64).min(1.0) as f32;
                if value >= 1.0 || value - last_progress >= 0.01 {
                    callback(value);
                    last_progress = value;
                }
            }
        }

        let status = child
            .wait()
            .map_err(|error| anyhow!("Failed to run ffmpeg: {error}"))?;
        if cancellation_requested(token) {
            remove_output(self.output);
            return Err(cancelled_error());
        }
        require_conversion_success(status, self.output)?;
        callback(1.0);
        Ok(())
    }

    fn run_polled(&self, token: Option<&CancellationToken>) -> Result<()> {
        let mut child = spawn_conversion(&mut self.command(false))?;
        let status = loop {
            if cancellation_requested(token) {
                terminate_cancelled(&mut child, self.output);
                return Err(cancelled_error());
            }
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => thread::sleep(CONVERSION_POLL),
                Err(error) => {
                    let _ = child.kill();
                    remove_output(self.output);
                    return Err(anyhow!("Failed to run ffmpeg: {error}"));
                }
            }
        };
        require_conversion_success(status, self.output)
    }
}

fn spawn_conversion(command: &mut Command) -> Result<Child> {
    command.spawn().map_err(|error| match error.kind() {
        ErrorKind::NotFound => anyhow!("FFmpeg not found on PATH."),
        _ => anyhow!("Failed to run ffmpeg: {error}"),
    })
}

fn require_conversion_success(status: ExitStatus, output: &Path) -> Result<()> {
    if status.success() {
        Ok(())
    } else {
        remove_output(output);
        Err(anyhow!("ffmpeg conversion failed"))
    }
}

fn ensure_not_cancelled(token: Option<&CancellationToken>) -> Result<()> {
    if cancellation_requested(token) {
        Err(cancelled_error())
    } else {
        Ok(())
    }
}

fn cancellation_requested(token: Option<&CancellationToken>) -> bool {
    token.is_some_and(CancellationToken::is_cancelled)
}

fn terminate_cancelled(child: &mut Child, output: &Path) {
    let _ = child.kill();
    let _ = child.wait();
    remove_output(output);
}

fn remove_output(path: &Path) {
    let _ = fs::remove_file(path);
}

fn progress_timestamp_ms(line: &str) -> Option<u64> {
    let (field, raw) = line.split_once('=')?;
    let value = raw.trim();
    match field {
        "out_time_ms" => value.parse().ok(),
        "out_time_us" => value.parse::<u64>().ok().map(|micros| micros / 1_000),
        "out_time" => clock_timestamp_ms(value),
        _ => None,
    }
}

fn clock_timestamp_ms(value: &str) -> Option<u64> {
    let mut fields = value.split(':');
    let hours = fields.next()?.parse::<u64>().ok()?;
    let minutes = fields.next()?.parse::<u64>().ok()?;
    let seconds = fields.next()?.parse::<f64>().ok()?;
    if fields.next().is_some() {
        return None;
    }
    let total = hours as f64 * 3_600.0 + minutes as f64 * 60.0 + seconds;
    (total.is_finite() && total >= 0.0).then_some((total * 1_000.0) as u64)
}

pub(super) fn denoise_wav(input: &Path, token: &CancellationToken) -> Result<()> {
    let ffmpeg = find_ffmpeg_in_path().ok_or_else(|| {
        anyhow!("FFmpeg is required to reduce background noise. Install ffmpeg and try again.")
    })?;
    DenoiseTransaction::new(input).run(&ffmpeg, token)
}

struct DenoiseTransaction {
    source: PathBuf,
    filtered: PathBuf,
    backup: PathBuf,
}

impl DenoiseTransaction {
    fn new(input: &Path) -> Self {
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("audio");
        Self {
            source: input.to_path_buf(),
            filtered: input.with_file_name(format!("{stem}.denoised.wav")),
            backup: input.with_file_name(format!("{stem}.before-denoise.wav")),
        }
    }

    fn run(&self, ffmpeg: &Path, token: &CancellationToken) -> Result<()> {
        let mut child = Command::new(ffmpeg)
            .args(["-nostdin", "-v", "error", "-y", "-i"])
            .arg(&self.source)
            .args(["-af", DENOISE_FILTER, "-ar"])
            .arg(TARGET_SAMPLE_RATE.to_string())
            .args(["-ac", "1", "-c:a", "pcm_s16le"])
            .arg(&self.filtered)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("Failed to start FFmpeg denoising")?;

        let status = loop {
            if token.is_cancelled() {
                terminate_cancelled(&mut child, &self.filtered);
                return Err(cancelled_error());
            }
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => thread::sleep(DENOISE_POLL),
                Err(error) => {
                    let _ = child.kill();
                    remove_output(&self.filtered);
                    return Err(anyhow!("FFmpeg denoising failed: {error}"));
                }
            }
        };
        if !status.success() || !self.filtered.is_file() {
            remove_output(&self.filtered);
            return Err(anyhow!("FFmpeg could not reduce background noise"));
        }
        self.commit()
    }

    fn commit(&self) -> Result<()> {
        fs::rename(&self.source, &self.backup)
            .context("Could not preserve audio before denoising")?;
        if let Err(error) = fs::rename(&self.filtered, &self.source) {
            let _ = fs::rename(&self.backup, &self.source);
            remove_output(&self.filtered);
            return Err(anyhow!("Could not store denoised audio: {error}"));
        }
        remove_output(&self.backup);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_parser_accepts_all_ffmpeg_time_fields() {
        assert_eq!(progress_timestamp_ms("out_time_ms=1200"), Some(1_200));
        assert_eq!(progress_timestamp_ms("out_time_us=1200000"), Some(1_200));
        assert_eq!(
            progress_timestamp_ms("out_time=01:02:03.500"),
            Some(3_723_500)
        );
        assert_eq!(progress_timestamp_ms("progress=continue"), None);
        assert_eq!(progress_timestamp_ms("out_time=invalid"), None);
    }

    #[test]
    fn denoise_policy_remains_conservative_and_tracks_noise_floor() {
        assert!(DENOISE_FILTER.contains("nr=10"));
        assert!(DENOISE_FILTER.contains("nf=-80"));
        assert!(DENOISE_FILTER.contains("tn=1"));
    }

    #[test]
    fn conversion_command_keeps_pcm_contract_and_optional_progress_pipe() {
        let conversion = FfmpegConversion {
            binary: Path::new("ffmpeg"),
            input: Path::new("input.mp4"),
            output: Path::new("output.wav"),
        };
        let plain = conversion
            .command(false)
            .get_args()
            .map(|value| value.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert!(!plain.iter().any(|value| value == "-progress"));
        assert!(plain.windows(2).any(|pair| pair == ["-ar", "16000"]));
        assert!(plain.windows(2).any(|pair| pair == ["-ac", "1"]));

        let tracked = conversion
            .command(true)
            .get_args()
            .map(|value| value.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert!(tracked
            .windows(2)
            .any(|pair| pair == ["-progress", "pipe:1"]));
    }
}
