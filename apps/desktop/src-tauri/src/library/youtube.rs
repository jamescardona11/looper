use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{model_manager, AppRuntime, AppState};

use super::processing::{
    build_folder_name, find_binary_in_path, library_root, report_import_progress,
    validate_import_model,
};
use super::types::{LibraryImportOptions, LibraryItem, LibraryItemStatus};

const METADATA_TIMEOUT: Duration = Duration::from_secs(45);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(2 * 60 * 60);
const DOWNLOAD_PROGRESS_SHARE: f32 = 0.25;
const MAX_CAPTURE_BYTES: usize = 4 * 1024 * 1024;
type LineCallback = Arc<dyn Fn(&str) + Send + Sync>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct YoutubeImportMetadata {
    pub url: String,
    pub video_id: String,
    pub title: String,
    pub channel: Option<String>,
    pub duration_seconds: Option<f64>,
}

pub(crate) fn validate_youtube_url(raw: &str) -> Result<String> {
    let url = reqwest::Url::parse(raw.trim()).context("Enter a valid YouTube URL")?;
    if url.scheme() != "https" {
        return Err(anyhow!("YouTube imports require an HTTPS URL"));
    }
    if !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return Err(anyhow!(
            "The YouTube URL contains unsupported credentials or a port"
        ));
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if !matches!(
        host.as_str(),
        "youtube.com"
            | "www.youtube.com"
            | "m.youtube.com"
            | "music.youtube.com"
            | "youtu.be"
            | "www.youtu.be"
            | "youtube-nocookie.com"
            | "www.youtube-nocookie.com"
    ) {
        return Err(anyhow!("Only YouTube URLs are supported"));
    }
    Ok(url.to_string())
}

pub(crate) fn probe_youtube_metadata(raw_url: &str) -> Result<YoutubeImportMetadata> {
    let url = validate_youtube_url(raw_url)?;
    let output = run_ytdlp(
        metadata_args(&url),
        METADATA_TIMEOUT,
        None,
        Arc::new(|_| {}),
    )?;
    if !output.status_success {
        return Err(ytdlp_failure(
            "Could not read YouTube video details",
            &output.stderr,
        ));
    }
    parse_metadata_output(&output.stdout)
}

pub(crate) fn create_youtube_item(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    metadata: &YoutubeImportMetadata,
    options: &LibraryImportOptions,
) -> Result<LibraryItem> {
    let remote_selection = validate_import_model(app, &options.model_key)?;
    let id = Uuid::new_v4().to_string();
    let folder_name = build_folder_name(&metadata.title, &id);
    let audio_path = library_root(app)?
        .join(folder_name)
        .join(format!("{id}.wav"));
    let show_timestamps = if remote_selection {
        options.show_timestamps
    } else {
        options.show_timestamps
            && model_manager::model_supports_capability(
                &options.model_key,
                model_manager::MODEL_CAPABILITY_TIMESTAMPS,
            )
    };
    let item = LibraryItem {
        id,
        name: metadata.title.chars().take(300).collect(),
        audio_path: audio_path.to_string_lossy().to_string(),
        source_path: metadata.url.clone(),
        store_original: options.store_original,
        status: LibraryItemStatus::Pending,
        transcript: None,
        segments: None,
        words: None,
        duration_seconds: metadata.duration_seconds.unwrap_or_default() as f32,
        file_size_bytes: 0,
        original_format: "youtube".to_string(),
        created_at: Utc::now().to_rfc3339(),
        transcribed_at: None,
        tags: vec!["youtube".to_string()],
        llm_cleanup_enabled: false,
        denoise_enabled: options.denoise_enabled,
        speech_model: options.model_key.clone(),
        show_timestamps,
        detect_speakers: remote_selection && options.detect_speakers,
        kind: "youtube".to_string(),
        speakers: None,
    };
    state.storage().insert_library_item(item.clone())
}

pub(crate) fn download_youtube_audio(
    app: &AppHandle<AppRuntime>,
    item_id: &str,
    raw_url: &str,
    token: &CancellationToken,
) -> Result<PathBuf> {
    let url = validate_youtube_url(raw_url)?;
    let download_dir = youtube_download_root(app)?.join(item_id);
    if download_dir.exists() {
        fs::remove_dir_all(&download_dir).with_context(|| {
            format!(
                "Could not reset YouTube import at {}",
                download_dir.display()
            )
        })?;
    }
    fs::create_dir_all(&download_dir)?;

    let app_for_progress = app.clone();
    let item_id_for_progress = item_id.to_string();
    let progress_callback: Arc<dyn Fn(&str) + Send + Sync> = Arc::new(move |line| {
        let Some(percent) = line.strip_prefix("looper-progress:") else {
            return;
        };
        let percent = percent.trim().trim_end_matches('%').trim().parse::<f32>();
        if let Ok(percent) = percent {
            let state = app_for_progress.state::<AppState>();
            report_import_progress(
                &app_for_progress,
                state.storage(),
                &item_id_for_progress,
                (percent / 100.0) * DOWNLOAD_PROGRESS_SHARE,
            );
        }
    });
    let output = run_ytdlp(
        download_args(&url, &download_dir, None),
        DOWNLOAD_TIMEOUT,
        Some(token),
        progress_callback.clone(),
    );

    let output = match output {
        Ok(output) => output,
        Err(err) => {
            let _ = fs::remove_dir_all(&download_dir);
            return Err(err);
        }
    };
    let output = if !output.status_success && should_retry_with_compatible_client(&output.stderr) {
        let _ = fs::remove_dir_all(&download_dir);
        fs::create_dir_all(&download_dir)?;
        run_ytdlp(
            download_args(&url, &download_dir, Some("android_vr")),
            DOWNLOAD_TIMEOUT,
            Some(token),
            progress_callback,
        )?
    } else {
        output
    };
    if !output.status_success {
        let _ = fs::remove_dir_all(&download_dir);
        return Err(ytdlp_failure(
            "Could not download YouTube audio",
            &output.stderr,
        ));
    }

    let downloaded = output
        .stdout
        .lines()
        .filter_map(|line| line.strip_prefix("looper-file:"))
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .next_back()
        .or_else(|| find_downloaded_media(&download_dir))
        .ok_or_else(|| anyhow!("yt-dlp finished without creating an audio file"))?;
    let canonical_dir = fs::canonicalize(&download_dir)?;
    let canonical_file = fs::canonicalize(&downloaded)?;
    if !canonical_file.starts_with(&canonical_dir) || !canonical_file.is_file() {
        let _ = fs::remove_dir_all(&download_dir);
        return Err(anyhow!("yt-dlp returned an unsafe output path"));
    }
    Ok(canonical_file)
}

pub(crate) fn cleanup_youtube_download(app: &AppHandle<AppRuntime>, item_id: &str) {
    let Ok(root) = youtube_download_root(app) else {
        return;
    };
    let candidate = root.join(item_id);
    if candidate.parent() == Some(root.as_path()) {
        let _ = fs::remove_dir_all(candidate);
    }
}

pub(crate) const fn download_progress_share() -> f32 {
    DOWNLOAD_PROGRESS_SHARE
}

fn youtube_download_root(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    let root = app
        .path()
        .app_cache_dir()
        .context("Could not locate the app cache directory")?
        .join("youtube-imports");
    fs::create_dir_all(&root)?;
    Ok(root)
}

fn metadata_args(url: &str) -> Vec<OsString> {
    [
        "--ignore-config",
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--no-colors",
        "--print",
        "[%(id)j,%(title)j,%(uploader)j,%(duration)j,%(webpage_url)j]",
        "--",
        url,
    ]
    .into_iter()
    .map(OsString::from)
    .collect()
}

fn download_args(
    url: &str,
    download_dir: &Path,
    compatible_player_client: Option<&str>,
) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        "--ignore-config".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--no-colors".into(),
        "--newline".into(),
        "--progress-delta".into(),
        "0.5".into(),
        "--progress-template".into(),
        "download:looper-progress:%(progress._percent_str)s".into(),
        "--print".into(),
        "after_move:looper-file:%(filepath)s".into(),
        "--max-filesize".into(),
        "4G".into(),
        "--format".into(),
        "bestaudio/best".into(),
        "--paths".into(),
        download_dir.as_os_str().to_owned(),
        "--output".into(),
        "audio.%(ext)s".into(),
    ];
    if let Some(client) = compatible_player_client {
        args.extend([
            "--extractor-args".into(),
            format!("youtube:player_client={client}").into(),
        ]);
    }
    args.extend(["--".into(), url.into()]);
    args
}

fn find_ytdlp() -> Result<PathBuf> {
    let file_name = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };
    let fallback_dirs: &[&str] = if cfg!(target_os = "macos") {
        &[
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/opt/local/bin",
            "/usr/bin",
        ]
    } else {
        &["/usr/local/bin", "/usr/bin"]
    };
    find_binary_in_path(file_name, fallback_dirs).ok_or_else(|| {
        anyhow!("yt-dlp is required for YouTube imports. Install yt-dlp and restart Looper.")
    })
}

struct ProcessCapture {
    status_success: bool,
    stdout: String,
    stderr: String,
}

fn run_ytdlp(
    args: Vec<OsString>,
    timeout: Duration,
    token: Option<&CancellationToken>,
    on_stdout_line: LineCallback,
) -> Result<ProcessCapture> {
    let mut child = Command::new(find_ytdlp()?)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("Could not start yt-dlp")?;
    let stdout = child
        .stdout
        .take()
        .context("Could not read yt-dlp output")?;
    let stderr = child
        .stderr
        .take()
        .context("Could not read yt-dlp errors")?;
    let stdout_thread = thread::spawn(move || capture_lines(stdout, Some(on_stdout_line)));
    let stderr_thread = thread::spawn(move || capture_lines(stderr, None));
    let started = Instant::now();

    let status = loop {
        if token.is_some_and(CancellationToken::is_cancelled) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(super::types::cancelled_error());
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(anyhow!("yt-dlp timed out"));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(err) => {
                let _ = child.kill();
                return Err(anyhow!("yt-dlp failed: {err}"));
            }
        }
    };
    let stdout = stdout_thread
        .join()
        .map_err(|_| anyhow!("Could not collect yt-dlp output"))?;
    let stderr = stderr_thread
        .join()
        .map_err(|_| anyhow!("Could not collect yt-dlp errors"))?;
    Ok(ProcessCapture {
        status_success: status.success(),
        stdout,
        stderr,
    })
}

fn capture_lines(stream: impl Read, on_line: Option<LineCallback>) -> String {
    let mut reader = BufReader::new(stream);
    let mut captured = Vec::new();
    let mut line = Vec::new();
    loop {
        line.clear();
        match reader.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                if let Ok(text) = std::str::from_utf8(&line) {
                    if let Some(callback) = &on_line {
                        callback(text.trim());
                    }
                }
                let remaining = MAX_CAPTURE_BYTES.saturating_sub(captured.len());
                captured.extend_from_slice(&line[..line.len().min(remaining)]);
            }
        }
    }
    String::from_utf8_lossy(&captured).to_string()
}

fn parse_metadata_output(output: &str) -> Result<YoutubeImportMetadata> {
    type MetadataTuple = (String, String, Option<String>, Option<f64>, String);
    let line = output
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .context("yt-dlp returned no video details")?;
    let (video_id, title, channel, duration_seconds, url): MetadataTuple =
        serde_json::from_str(line).context("yt-dlp returned invalid video details")?;
    let url = validate_youtube_url(&url)?;
    if video_id.trim().is_empty() || title.trim().is_empty() {
        return Err(anyhow!("YouTube video details are incomplete"));
    }
    Ok(YoutubeImportMetadata {
        url,
        video_id,
        title,
        channel,
        duration_seconds,
    })
}

fn find_downloaded_media(directory: &Path) -> Option<PathBuf> {
    fs::read_dir(directory)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.is_file()
                && path.extension().and_then(|value| value.to_str()) != Some("part")
                && path.file_name().and_then(|value| value.to_str()) != Some("archive.txt")
        })
}

fn ytdlp_failure(context: &str, stderr: &str) -> anyhow::Error {
    let detail = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("Unknown yt-dlp error")
        .trim();
    anyhow!("{context}: {detail}")
}

fn should_retry_with_compatible_client(stderr: &str) -> bool {
    let message = stderr.to_ascii_lowercase();
    message.contains("http error 403")
        || message.contains("forbidden")
        || message.contains("page needs to be reloaded")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_https_youtube_hosts() {
        assert!(validate_youtube_url("https://youtu.be/abc").is_ok());
        assert!(validate_youtube_url("https://music.youtube.com/watch?v=abc").is_ok());
        assert!(validate_youtube_url("http://youtube.com/watch?v=abc").is_err());
        assert!(validate_youtube_url("https://youtube.com.evil.test/watch?v=abc").is_err());
        assert!(validate_youtube_url("https://example.com/?next=youtube.com").is_err());
    }

    #[test]
    fn parses_small_structured_metadata_output() {
        let metadata = parse_metadata_output(
            r#"["abc","A useful talk","Example channel",123.5,"https://www.youtube.com/watch?v=abc"]"#,
        )
        .unwrap();

        assert_eq!(metadata.video_id, "abc");
        assert_eq!(metadata.title, "A useful talk");
        assert_eq!(metadata.channel.as_deref(), Some("Example channel"));
        assert_eq!(metadata.duration_seconds, Some(123.5));
    }

    #[test]
    fn download_contract_ignores_config_and_stays_in_the_managed_directory() {
        let directory = Path::new("/tmp/looper-youtube/item");
        let args = download_args("https://youtu.be/abc", directory, Some("android_vr"));
        let args: Vec<String> = args
            .iter()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(args.contains(&"--ignore-config".to_string()));
        assert!(args.contains(&"--no-playlist".to_string()));
        assert!(args.contains(&"4G".to_string()));
        assert!(args.contains(&"youtube:player_client=android_vr".to_string()));
        assert_eq!(args[args.len() - 2], "--");
        assert_eq!(args.last().unwrap(), "https://youtu.be/abc");
        let paths_index = args.iter().position(|arg| arg == "--paths").unwrap();
        assert_eq!(args[paths_index + 1], directory.to_string_lossy());
        assert!(should_retry_with_compatible_client(
            "HTTP Error 403: Forbidden"
        ));
        assert!(!should_retry_with_compatible_client("Video is private"));
    }
}
