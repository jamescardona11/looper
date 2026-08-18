use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs, io,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use reqwest::{
    header::{ACCEPT_ENCODING, CONTENT_LENGTH, CONTENT_RANGE, RANGE},
    Client, Response, StatusCode,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

use crate::{Error, Result};

const HASH_BUFFER_BYTES: usize = 1024 * 1024;
const PROGRESS_STEP_BYTES: u64 = 1024 * 1024;
const MAX_DOWNLOAD_RETRIES: usize = 3;
const RETRY_BACKOFF_BASE_MS: u64 = 100;
const RETRY_BACKOFF_MAX_MS: u64 = 800;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelSpec {
    pub id: String,
    pub files: Vec<RemoteFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteFile {
    pub url: String,
    pub path: String,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelStatus {
    pub id: String,
    pub installed: bool,
    pub bytes_on_disk: u64,
    pub missing_files: Vec<String>,
    pub directory: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedModel {
    pub id: String,
    pub directory: PathBuf,
    pub files: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InstallEvent {
    pub model: String,
    pub file: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub verifying: bool,
}

#[derive(Default)]
pub struct InstallOptions<'a> {
    pub cancel_token: Option<CancellationToken>,
    pub progress: Option<&'a (dyn Fn(InstallEvent) + Send + Sync + 'a)>,
}

#[derive(Clone)]
pub struct ModelStore {
    root: PathBuf,
    client: Client,
    active_installs: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl ModelStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            client: Client::new(),
            active_installs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn model_dir(&self, id: &str) -> Result<PathBuf> {
        validate_model_id(id)?;
        Ok(self.root.join(id))
    }

    pub fn status(&self, spec: &ModelSpec) -> Result<ModelStatus> {
        self.status_inner(spec).map_err(classify_validation_error)
    }

    fn status_inner(&self, spec: &ModelSpec) -> Result<ModelStatus> {
        validate_spec(spec)?;
        let directory = self.model_dir(&spec.id)?;
        let mut missing_files = Vec::new();

        for file in &spec.files {
            if !file_ready(&directory.join(&file.path), file.size_bytes)? {
                missing_files.push(file.path.clone());
            }
        }

        let installed = directory.is_dir() && missing_files.is_empty();
        let bytes_on_disk = directory_size(&directory)?;

        Ok(ModelStatus {
            id: spec.id.clone(),
            installed,
            bytes_on_disk,
            missing_files,
            directory: directory.display().to_string(),
        })
    }

    pub async fn install(
        &self,
        spec: &ModelSpec,
        options: InstallOptions<'_>,
    ) -> Result<ModelStatus> {
        self.install_inner(spec, options)
            .await
            .map_err(classify_install_error)
    }

    async fn install_inner(
        &self,
        spec: &ModelSpec,
        options: InstallOptions<'_>,
    ) -> Result<ModelStatus> {
        validate_install_spec(spec)?;
        let directory = self.model_dir(&spec.id)?;
        prepare_model_directory(&self.root, &directory)?;

        let operation_token = CancellationToken::new();
        let _active_install = self.register_install(&spec.id, operation_token.clone())?;

        for file in &spec.files {
            self.download_file(&spec.id, &directory, file, &operation_token, &options)
                .await?;
        }

        emit_verifying(&spec.id, &options);
        let status = self.status_inner(spec)?;
        if !status.installed {
            return Err(Error::Download(format!(
                "{} is incomplete after installation; missing: {}",
                spec.id,
                status.missing_files.join(", ")
            )));
        }

        Ok(status)
    }

    pub fn cancel(&self, id: &str) -> bool {
        let token = self
            .active_installs
            .lock()
            .ok()
            .and_then(|active| active.get(id).cloned());
        if let Some(token) = token {
            token.cancel();
            true
        } else {
            false
        }
    }

    pub fn delete(&self, id: &str) -> Result<ModelStatus> {
        self.delete_inner(id).map_err(classify_validation_error)
    }

    fn delete_inner(&self, id: &str) -> Result<ModelStatus> {
        let directory = self.model_dir(id)?;
        if self
            .active_installs
            .lock()
            .map_err(|_| Error::Validation("model install registry is poisoned".to_string()))?
            .contains_key(id)
        {
            return Err(Error::Validation(format!(
                "cannot delete {id} while its installation is running"
            )));
        }

        match fs::symlink_metadata(&directory) {
            Ok(metadata) if metadata.file_type().is_symlink() || metadata.is_file() => {
                fs::remove_file(&directory)?;
            }
            Ok(_) => fs::remove_dir_all(&directory)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }

        Ok(ModelStatus {
            id: id.to_string(),
            installed: false,
            bytes_on_disk: 0,
            missing_files: Vec::new(),
            directory: directory.display().to_string(),
        })
    }

    pub fn resolve(&self, spec: &ModelSpec) -> Result<ResolvedModel> {
        self.resolve_inner(spec).map_err(classify_validation_error)
    }

    fn resolve_inner(&self, spec: &ModelSpec) -> Result<ResolvedModel> {
        let status = self.status_inner(spec)?;
        if !status.installed {
            return Err(Error::Validation(format!(
                "{} is not installed; missing: {}",
                spec.id,
                status.missing_files.join(", ")
            )));
        }

        let directory = self.model_dir(&spec.id)?;
        Ok(ResolvedModel {
            id: spec.id.clone(),
            files: spec
                .files
                .iter()
                .map(|file| directory.join(&file.path))
                .collect(),
            directory,
        })
    }

    fn register_install(&self, id: &str, token: CancellationToken) -> Result<ActiveInstall> {
        let mut active = self
            .active_installs
            .lock()
            .map_err(|_| Error::Validation("model install registry is poisoned".to_string()))?;
        if active.contains_key(id) {
            return Err(Error::Validation(format!(
                "an installation for {id} is already running"
            )));
        }
        active.insert(id.to_string(), token);

        Ok(ActiveInstall {
            id: id.to_string(),
            active_installs: Arc::clone(&self.active_installs),
        })
    }

    async fn download_file(
        &self,
        model_id: &str,
        directory: &Path,
        remote: &RemoteFile,
        operation_token: &CancellationToken,
        options: &InstallOptions<'_>,
    ) -> Result<()> {
        let target = directory.join(&remote.path);
        prepare_file_parent(directory, Path::new(&remote.path))?;
        reject_unsafe_existing_file(&target)?;
        let part = sibling_with_suffix(&target, ".part")?;
        reject_unsafe_existing_file(&part)?;

        if self
            .installed_file_is_valid(model_id, &target, remote, operation_token, options)
            .await?
        {
            remove_file_if_present(&part)?;
            return Ok(());
        }

        if let Some(part_size) = regular_file_size(&part)? {
            if remote
                .size_bytes
                .is_some_and(|expected| part_size > expected)
            {
                remove_file_if_present(&part)?;
            } else if remote
                .size_bytes
                .is_some_and(|expected| part_size == expected)
            {
                match self
                    .verify_download(model_id, &part, remote, operation_token, options)
                    .await
                {
                    Ok(()) => {
                        replace_file(&part, &target).await?;
                        return Ok(());
                    }
                    Err(Error::Checksum { .. }) => remove_file_if_present(&part)?,
                    Err(error) => return Err(error),
                }
            }
        }

        let mut retry_count = 0usize;
        'request: loop {
            ensure_not_cancelled(model_id, operation_token, options)?;
            let offset = regular_file_size(&part)?.unwrap_or(0);
            emit_progress(
                model_id,
                remote,
                offset,
                remote.size_bytes.unwrap_or(0),
                false,
                options,
            );

            let mut request = self
                .client
                .get(&remote.url)
                .header(ACCEPT_ENCODING, "identity");
            if offset > 0 {
                request = request.header(RANGE, format!("bytes={offset}-"));
            }

            let response = tokio::select! {
                biased;
                _ = wait_for_cancellation(operation_token, options.cancel_token.as_ref()) => {
                    return Err(cancelled_error(model_id));
                }
                response = request.send() => response
            };
            let response = match response {
                Ok(response) => response,
                Err(error) => {
                    retry_after_failure(
                        &mut retry_count,
                        format!("failed to download {}: {error}", remote.path),
                        model_id,
                        operation_token,
                        options.cancel_token.as_ref(),
                    )
                    .await?;
                    continue;
                }
            };

            if offset > 0 && response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
                let server_total = response_content_range(&response)?
                    .and_then(|content_range| content_range.total);
                if server_total == Some(offset)
                    && remote.size_bytes.is_none_or(|expected| expected == offset)
                {
                    if let Err(error) = self
                        .verify_download(model_id, &part, remote, operation_token, options)
                        .await
                    {
                        if matches!(error, Error::Checksum { .. }) {
                            remove_file_if_present(&part)?;
                        }
                        return Err(error);
                    }
                    replace_file(&part, &target).await?;
                    return Ok(());
                }

                remove_file_if_present(&part)?;
                continue;
            }

            if is_retryable_status(response.status()) {
                let status = response.status();
                retry_after_failure(
                    &mut retry_count,
                    format!("download of {} failed with HTTP {status}", remote.path),
                    model_id,
                    operation_token,
                    options.cancel_token.as_ref(),
                )
                .await?;
                continue;
            }

            let response = validate_response(response, offset, remote)?;
            let append = offset > 0 && response.status() == StatusCode::PARTIAL_CONTENT;
            let downloaded_before_response = if append { offset } else { 0 };
            let response_metadata =
                response_metadata(&response, downloaded_before_response, remote)?;
            let total = remote.size_bytes.or(response_metadata.total).unwrap_or(0);

            let mut output = if append {
                tokio::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&part)
                    .await?
            } else {
                tokio::fs::File::create(&part).await?
            };
            let mut response = response;
            let mut downloaded = downloaded_before_response;
            let mut last_emitted = downloaded;

            let mut stream_failure = None;
            loop {
                let chunk = tokio::select! {
                    biased;
                    _ = wait_for_cancellation(operation_token, options.cancel_token.as_ref()) => {
                        return Err(cancelled_error(model_id));
                    }
                    chunk = response.chunk() => chunk
                };
                let chunk = match chunk {
                    Ok(chunk) => chunk,
                    Err(error) => {
                        stream_failure = Some(format!(
                            "network interrupted while downloading {}: {error}",
                            remote.path
                        ));
                        break;
                    }
                };

                let Some(chunk) = chunk else {
                    break;
                };
                tokio::select! {
                    biased;
                    _ = wait_for_cancellation(operation_token, options.cancel_token.as_ref()) => {
                        return Err(cancelled_error(model_id));
                    }
                    result = output.write_all(&chunk) => result?,
                }
                downloaded = downloaded.saturating_add(chunk.len() as u64);

                if downloaded.saturating_sub(last_emitted) >= PROGRESS_STEP_BYTES
                    || (total > 0 && downloaded >= total)
                {
                    emit_progress(model_id, remote, downloaded, total, false, options);
                    last_emitted = downloaded;
                }
            }

            if let Some(failure) = stream_failure {
                drop(output);
                retry_after_failure(
                    &mut retry_count,
                    failure,
                    model_id,
                    operation_token,
                    options.cancel_token.as_ref(),
                )
                .await?;
                continue 'request;
            }

            output.flush().await?;
            output.sync_all().await?;
            drop(output);

            let actual_size = regular_file_size(&part)?.unwrap_or(0);
            if let Some(response_end) = response_metadata.response_end {
                if actual_size < response_end {
                    retry_after_failure(
                        &mut retry_count,
                        format!(
                            "connection closed early while downloading {}: expected at least {response_end} bytes, received {actual_size}",
                            remote.path
                        ),
                        model_id,
                        operation_token,
                        options.cancel_token.as_ref(),
                    )
                    .await?;
                    continue 'request;
                }
            }
            if total > 0 && actual_size < total {
                retry_after_failure(
                    &mut retry_count,
                    format!(
                        "download of {} is incomplete: expected {total} bytes, received {actual_size}",
                        remote.path
                    ),
                    model_id,
                    operation_token,
                    options.cancel_token.as_ref(),
                )
                .await?;
                continue 'request;
            }

            self.verify_download(model_id, &part, remote, operation_token, options)
                .await
                .inspect_err(|error| {
                    if matches!(error, Error::Checksum { .. } | Error::Download(_)) {
                        let _ = remove_file_if_present(&part);
                    }
                })?;
            replace_file(&part, &target).await?;
            return Ok(());
        }
    }

    async fn installed_file_is_valid(
        &self,
        model_id: &str,
        path: &Path,
        remote: &RemoteFile,
        operation_token: &CancellationToken,
        options: &InstallOptions<'_>,
    ) -> Result<bool> {
        if !file_ready(path, remote.size_bytes)? {
            return Ok(false);
        }
        if remote.sha256.is_none() {
            return Ok(true);
        }

        match self
            .verify_download(model_id, path, remote, operation_token, options)
            .await
        {
            Ok(()) => Ok(true),
            Err(Error::Checksum { .. }) => Ok(false),
            Err(error) => Err(error),
        }
    }

    async fn verify_download(
        &self,
        model_id: &str,
        path: &Path,
        remote: &RemoteFile,
        operation_token: &CancellationToken,
        options: &InstallOptions<'_>,
    ) -> Result<()> {
        ensure_not_cancelled(model_id, operation_token, options)?;
        let actual_size = regular_file_size(path)?.ok_or_else(|| {
            Error::Download(format!("{} disappeared before verification", remote.path))
        })?;
        if let Some(expected_size) = remote.size_bytes {
            if actual_size != expected_size {
                return Err(Error::Download(format!(
                    "size mismatch for {}: expected {expected_size}, received {actual_size}",
                    remote.path
                )));
            }
        }

        let Some(expected_sha256) = remote.sha256.as_ref() else {
            return Ok(());
        };
        let actual_sha256 = sha256_file(
            path,
            model_id,
            operation_token,
            options.cancel_token.as_ref(),
        )
        .await?;
        if !actual_sha256.eq_ignore_ascii_case(expected_sha256) {
            return Err(Error::Checksum {
                path: path.to_path_buf(),
                expected: expected_sha256.clone(),
                actual: actual_sha256,
            });
        }

        Ok(())
    }
}

fn classify_validation_error(error: Error) -> Error {
    if matches!(&error, Error::Validation(_) | Error::Cancelled(_)) {
        error
    } else {
        Error::Validation(error.to_string())
    }
}

fn classify_install_error(error: Error) -> Error {
    if matches!(
        &error,
        Error::Validation(_) | Error::Download(_) | Error::Checksum { .. } | Error::Cancelled(_)
    ) {
        error
    } else {
        Error::Download(error.to_string())
    }
}

struct ActiveInstall {
    id: String,
    active_installs: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl Drop for ActiveInstall {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active_installs.lock() {
            active.remove(&self.id);
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ContentRange {
    start: Option<u64>,
    end: Option<u64>,
    total: Option<u64>,
}

#[derive(Debug, Clone, Copy)]
struct ResponseMetadata {
    response_end: Option<u64>,
    total: Option<u64>,
}

fn validate_spec(spec: &ModelSpec) -> Result<()> {
    validate_model_id(&spec.id)?;
    if spec.files.is_empty() {
        return Err(Error::Validation(format!(
            "{} does not declare any files",
            spec.id
        )));
    }

    let mut seen = HashSet::new();
    let mut paths = Vec::with_capacity(spec.files.len());
    for file in &spec.files {
        validate_relative_file_path(&file.path)?;
        if !seen.insert(file.path.as_str()) {
            return Err(Error::Validation(format!(
                "{} declares {} more than once",
                spec.id, file.path
            )));
        }

        if let Some(sha256) = &file.sha256 {
            if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err(Error::Validation(format!(
                    "{} has an invalid SHA-256 digest",
                    file.path
                )));
            }
        }
        paths.push(PathBuf::from(&file.path));
    }

    for (index, path) in paths.iter().enumerate() {
        for other in paths.iter().skip(index + 1) {
            if path.starts_with(other) || other.starts_with(path) {
                return Err(Error::Validation(format!(
                    "model file paths overlap: {} and {}",
                    path.display(),
                    other.display()
                )));
            }
        }
    }

    Ok(())
}

fn validate_install_spec(spec: &ModelSpec) -> Result<()> {
    validate_spec(spec)?;
    for file in &spec.files {
        let url = reqwest::Url::parse(&file.url).map_err(|error| {
            Error::Validation(format!("invalid URL for {}: {error}", file.path))
        })?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(Error::Validation(format!(
                "{} must use an HTTP or HTTPS URL",
                file.path
            )));
        }
    }
    Ok(())
}

fn validate_model_id(id: &str) -> Result<()> {
    if id.is_empty()
        || matches!(id, "." | "..")
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(Error::Validation(format!("invalid model id: {id}")));
    }
    Ok(())
}

fn validate_relative_file_path(value: &str) -> Result<()> {
    if value.is_empty() || value.contains('\\') || value.contains('\0') {
        return Err(Error::Validation(format!(
            "invalid model file path: {value}"
        )));
    }

    let path = Path::new(value);
    if path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(Error::Validation(format!(
            "invalid model file path: {}",
            path.display()
        )));
    }
    Ok(())
}

fn prepare_model_directory(root: &Path, directory: &Path) -> Result<()> {
    fs::create_dir_all(root)?;
    require_directory(root)?;
    create_safe_directory(directory)
}

fn prepare_file_parent(directory: &Path, relative: &Path) -> Result<()> {
    require_directory(directory)?;
    let Some(parent) = relative.parent() else {
        return Ok(());
    };

    let mut current = directory.to_path_buf();
    for component in parent.components() {
        let Component::Normal(component) = component else {
            return Err(Error::Validation(format!(
                "invalid model file path: {}",
                relative.display()
            )));
        };
        current.push(component);
        create_safe_directory(&current)?;
    }
    Ok(())
}

fn create_safe_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(Error::Validation(format!(
            "model path cannot contain a symbolic link: {}",
            path.display()
        ))),
        Ok(metadata) if !metadata.is_dir() => Err(Error::Validation(format!(
            "expected a model directory at {}",
            path.display()
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => match fs::create_dir(path) {
            Ok(()) => require_directory(path),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => require_directory(path),
            Err(error) => Err(error.into()),
        },
        Err(error) => Err(error.into()),
    }
}

fn require_directory(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(Error::Validation(format!(
            "expected a safe directory at {}",
            path.display()
        )));
    }
    Ok(())
}

fn reject_unsafe_existing_file(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(Error::Validation(format!(
            "model file cannot be a symbolic link: {}",
            path.display()
        ))),
        Ok(metadata) if !metadata.is_file() => Err(Error::Validation(format!(
            "expected a regular model file at {}",
            path.display()
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn file_ready(path: &Path, expected_size: Option<u64>) -> Result<bool> {
    let Some(actual_size) = regular_file_size(path)? else {
        return Ok(false);
    };
    Ok(expected_size.is_none_or(|expected| expected == actual_size))
}

fn regular_file_size(path: &Path) -> Result<Option<u64>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(Error::Validation(format!(
            "model file cannot be a symbolic link: {}",
            path.display()
        ))),
        Ok(metadata) if metadata.is_file() => Ok(Some(metadata.len())),
        Ok(_) => Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn directory_size(path: &Path) -> Result<u64> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
    };
    if metadata.file_type().is_symlink() {
        return Err(Error::Validation(format!(
            "model directory contains a symbolic link: {}",
            path.display()
        )));
    }
    if metadata.is_file() {
        return Ok(metadata.len());
    }

    let mut total = 0u64;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        total = total.saturating_add(directory_size(&entry.path())?);
    }
    Ok(total)
}

fn sibling_with_suffix(path: &Path, suffix: &str) -> Result<PathBuf> {
    let file_name = path.file_name().ok_or_else(|| {
        Error::Validation(format!(
            "model file path has no file name: {}",
            path.display()
        ))
    })?;
    let mut sibling_name = OsString::from(file_name);
    sibling_name.push(suffix);
    Ok(path.with_file_name(sibling_name))
}

fn remove_file_if_present(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

async fn replace_file(source: &Path, target: &Path) -> Result<()> {
    reject_unsafe_existing_file(source)?;
    reject_unsafe_existing_file(target)?;

    #[cfg(not(windows))]
    {
        tokio::fs::rename(source, target).await?;
        Ok(())
    }

    #[cfg(windows)]
    {
        replace_file_windows(source, target)?;
        Ok(())
    }
}

#[cfg(windows)]
fn replace_file_windows(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        #[link_name = "MoveFileExW"]
        fn move_file_ex_w(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    fn wide_path(path: &Path) -> io::Result<Vec<u16>> {
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        if wide.contains(&0) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Windows path contains a null character",
            ));
        }
        wide.push(0);
        Ok(wide)
    }

    let source = wide_path(source)?;
    let target = wide_path(target)?;
    // SAFETY: both buffers are valid, null-terminated UTF-16 strings and live
    // for the duration of the call. The source and target are sibling files.
    let replaced = unsafe {
        move_file_ex_w(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn validate_response(
    response: Response,
    requested_offset: u64,
    remote: &RemoteFile,
) -> Result<Response> {
    let status = response.status();
    if !matches!(status, StatusCode::OK | StatusCode::PARTIAL_CONTENT) {
        return Err(Error::Download(format!(
            "download of {} failed with HTTP {status}",
            remote.path
        )));
    }

    if status == StatusCode::PARTIAL_CONTENT {
        let content_range = response_content_range(&response)?.ok_or_else(|| {
            Error::Download(format!(
                "{} returned HTTP 206 without Content-Range",
                remote.path
            ))
        })?;
        if content_range.start != Some(requested_offset) {
            return Err(Error::Download(format!(
                "{} resumed at the wrong offset: requested {requested_offset}, received {:?}",
                remote.path, content_range.start
            )));
        }
    }

    Ok(response)
}

fn response_metadata(
    response: &Response,
    response_start: u64,
    remote: &RemoteFile,
) -> Result<ResponseMetadata> {
    let content_range = response_content_range(response)?;
    let content_length = response
        .headers()
        .get(CONTENT_LENGTH)
        .map(|header| {
            header
                .to_str()
                .map_err(|error| {
                    Error::Download(format!(
                        "{} returned an invalid Content-Length: {error}",
                        remote.path
                    ))
                })?
                .parse::<u64>()
                .map_err(|error| {
                    Error::Download(format!(
                        "{} returned an invalid Content-Length: {error}",
                        remote.path
                    ))
                })
        })
        .transpose()?;

    if let (Some(range), Some(length)) = (content_range, content_length) {
        if let (Some(start), Some(end)) = (range.start, range.end) {
            let range_length = end.saturating_sub(start).saturating_add(1);
            if range_length != length {
                return Err(Error::Download(format!(
                    "{} returned inconsistent Content-Range and Content-Length",
                    remote.path
                )));
            }
        }
    }

    let response_end = content_range
        .and_then(|range| range.end.map(|end| end.saturating_add(1)))
        .or_else(|| content_length.map(|length| response_start.saturating_add(length)));
    let response_total = content_range.and_then(|range| range.total).or_else(|| {
        (response.status() == StatusCode::OK)
            .then_some(content_length)
            .flatten()
    });

    if let (Some(expected), Some(server_total)) = (remote.size_bytes, response_total) {
        if expected != server_total {
            return Err(Error::Download(format!(
                "size mismatch for {}: catalog expects {expected}, server reports {server_total}",
                remote.path
            )));
        }
    }

    Ok(ResponseMetadata {
        response_end,
        total: response_total,
    })
}

fn response_content_range(response: &Response) -> Result<Option<ContentRange>> {
    response
        .headers()
        .get(CONTENT_RANGE)
        .map(|header| {
            let value = header.to_str().map_err(|error| {
                Error::Download(format!("invalid Content-Range header: {error}"))
            })?;
            parse_content_range(value)
        })
        .transpose()
}

fn parse_content_range(value: &str) -> Result<ContentRange> {
    let (unit, value) = value
        .split_once(' ')
        .ok_or_else(|| Error::Download(format!("invalid Content-Range header: {value}")))?;
    if !unit.eq_ignore_ascii_case("bytes") {
        return Err(Error::Download(format!(
            "unsupported Content-Range unit: {unit}"
        )));
    }
    let (range, total) = value
        .split_once('/')
        .ok_or_else(|| Error::Download(format!("invalid Content-Range header: {value}")))?;
    let total =
        if total == "*" {
            None
        } else {
            Some(total.parse::<u64>().map_err(|error| {
                Error::Download(format!("invalid Content-Range total: {error}"))
            })?)
        };

    if range == "*" {
        return Ok(ContentRange {
            start: None,
            end: None,
            total,
        });
    }
    let (start, end) = range
        .split_once('-')
        .ok_or_else(|| Error::Download(format!("invalid Content-Range interval: {range}")))?;
    let start = start
        .parse::<u64>()
        .map_err(|error| Error::Download(format!("invalid Content-Range start: {error}")))?;
    let end = end
        .parse::<u64>()
        .map_err(|error| Error::Download(format!("invalid Content-Range end: {error}")))?;
    if end < start || total.is_some_and(|total| end >= total) {
        return Err(Error::Download(format!(
            "invalid Content-Range interval: {range}/{:?}",
            total
        )));
    }

    Ok(ContentRange {
        start: Some(start),
        end: Some(end),
        total,
    })
}

async fn sha256_file(
    path: &Path,
    model_id: &str,
    operation_token: &CancellationToken,
    external_token: Option<&CancellationToken>,
) -> Result<String> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_BUFFER_BYTES];

    loop {
        let bytes_read = tokio::select! {
            biased;
            _ = wait_for_cancellation(operation_token, external_token) => {
                return Err(cancelled_error(model_id));
            }
            bytes_read = file.read(&mut buffer) => bytes_read?,
        };
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex_encode(&hasher.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn ensure_not_cancelled(
    model_id: &str,
    operation_token: &CancellationToken,
    options: &InstallOptions<'_>,
) -> Result<()> {
    if operation_token.is_cancelled()
        || options
            .cancel_token
            .as_ref()
            .is_some_and(CancellationToken::is_cancelled)
    {
        Err(cancelled_error(model_id))
    } else {
        Ok(())
    }
}

async fn wait_for_cancellation(
    operation_token: &CancellationToken,
    external_token: Option<&CancellationToken>,
) {
    if let Some(external_token) = external_token {
        tokio::select! {
            _ = operation_token.cancelled() => {}
            _ = external_token.cancelled() => {}
        }
    } else {
        operation_token.cancelled().await;
    }
}

fn is_retryable_status(status: StatusCode) -> bool {
    status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

async fn retry_after_failure(
    retry_count: &mut usize,
    failure: String,
    model_id: &str,
    operation_token: &CancellationToken,
    external_token: Option<&CancellationToken>,
) -> Result<()> {
    if *retry_count >= MAX_DOWNLOAD_RETRIES {
        return Err(Error::Download(format!(
            "{failure} after {} attempts",
            retry_count.saturating_add(1)
        )));
    }

    *retry_count += 1;
    let multiplier = 1u64 << retry_count.saturating_sub(1).min(3);
    let delay_ms = RETRY_BACKOFF_BASE_MS
        .saturating_mul(multiplier)
        .min(RETRY_BACKOFF_MAX_MS);
    tokio::select! {
        biased;
        _ = wait_for_cancellation(operation_token, external_token) => {
            Err(cancelled_error(model_id))
        }
        _ = tokio::time::sleep(Duration::from_millis(delay_ms)) => Ok(()),
    }
}

fn cancelled_error(model_id: &str) -> Error {
    Error::Cancelled(format!("model installation for {model_id}"))
}

fn emit_progress(
    model_id: &str,
    remote: &RemoteFile,
    downloaded: u64,
    total: u64,
    verifying: bool,
    options: &InstallOptions<'_>,
) {
    let Some(progress) = options.progress else {
        return;
    };
    let percent = if total == 0 {
        0.0
    } else {
        (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    };
    progress(InstallEvent {
        model: model_id.to_string(),
        file: remote.path.clone(),
        downloaded,
        total,
        percent,
        verifying,
    });
}

fn emit_verifying(model_id: &str, options: &InstallOptions<'_>) {
    let Some(progress) = options.progress else {
        return;
    };
    progress(InstallEvent {
        model: model_id.to_string(),
        file: String::new(),
        downloaded: 0,
        total: 0,
        percent: 100.0,
        verifying: true,
    });
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        sync::mpsc,
        thread,
        time::Duration,
    };

    use tempfile::TempDir;

    use super::*;

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum ServerMode {
        HonorRange,
        IgnoreRange,
        InterruptOnce,
        Slow,
    }

    fn sha256(bytes: &[u8]) -> String {
        hex_encode(&Sha256::digest(bytes))
    }

    fn spec(url: String, body: &[u8]) -> ModelSpec {
        ModelSpec {
            id: "test_model".to_string(),
            files: vec![RemoteFile {
                url,
                path: "weights/model.bin".to_string(),
                size_bytes: Some(body.len() as u64),
                sha256: Some(sha256(body)),
            }],
        }
    }

    fn read_request(stream: &mut TcpStream) -> String {
        let mut request = Vec::new();
        let mut buffer = [0u8; 1024];
        loop {
            let count = stream.read(&mut buffer).unwrap();
            if count == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..count]);
            if request.windows(4).any(|window| window == b"\r\n\r\n") {
                break;
            }
        }
        String::from_utf8(request).unwrap()
    }

    fn requested_offset(request: &str) -> usize {
        request
            .lines()
            .find_map(|line| line.strip_prefix("range: bytes="))
            .and_then(|value| value.strip_suffix('-'))
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0)
    }

    fn spawn_server(
        body: Vec<u8>,
        mode: ServerMode,
    ) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (request_tx, request_rx) = mpsc::channel();
        let handle = thread::spawn(move || {
            if mode == ServerMode::InterruptOnce {
                let (mut first_stream, _) = listener.accept().unwrap();
                let first_request = read_request(&mut first_stream);
                write!(
                    first_stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .unwrap();
                first_stream.write_all(&body[..8]).unwrap();
                first_stream.flush().unwrap();
                request_tx.send(first_request).unwrap();
                drop(first_stream);

                let (mut second_stream, _) = listener.accept().unwrap();
                let second_request = read_request(&mut second_stream);
                let offset = requested_offset(&second_request);
                let (status, headers, response_body) = if offset > 0 {
                    (
                        "206 Partial Content",
                        format!(
                            "Content-Range: bytes {offset}-{}/{}\r\n",
                            body.len() - 1,
                            body.len()
                        ),
                        &body[offset..],
                    )
                } else {
                    ("200 OK", String::new(), body.as_slice())
                };
                write!(
                    second_stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n",
                    response_body.len()
                )
                .unwrap();
                second_stream.write_all(response_body).unwrap();
                request_tx.send(second_request).unwrap();
                return;
            }

            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&mut stream);
            let offset = requested_offset(&request);

            let (status, headers, response_body) = match mode {
                ServerMode::HonorRange | ServerMode::Slow if offset > 0 => (
                    "206 Partial Content",
                    format!(
                        "Content-Range: bytes {offset}-{}/{}\r\n",
                        body.len() - 1,
                        body.len()
                    ),
                    &body[offset..],
                ),
                _ => ("200 OK", String::new(), body.as_slice()),
            };
            write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n",
                response_body.len()
            )
            .unwrap();

            if matches!(mode, ServerMode::Slow) {
                let split = response_body.len().min(1024);
                stream.write_all(&response_body[..split]).unwrap();
                stream.flush().unwrap();
                request_tx.send(request).unwrap();
                thread::sleep(Duration::from_millis(500));
                let _ = stream.write_all(&response_body[split..]);
            } else {
                stream.write_all(response_body).unwrap();
                request_tx.send(request).unwrap();
            }
        });

        (format!("http://{address}/model.bin"), request_rx, handle)
    }

    fn target_path(root: &TempDir) -> PathBuf {
        root.path()
            .join("test_model")
            .join("weights")
            .join("model.bin")
    }

    #[test]
    fn rejects_path_traversal_and_overlapping_files() {
        let store = ModelStore::new("/tmp/unused-model-store");
        let unsafe_spec = ModelSpec {
            id: "../outside".to_string(),
            files: vec![],
        };
        assert!(store.status(&unsafe_spec).is_err());
        assert!(store.model_dir("../outside").is_err());

        let overlapping = ModelSpec {
            id: "safe".to_string(),
            files: vec![
                RemoteFile {
                    url: "https://example.test/a".to_string(),
                    path: "weights".to_string(),
                    size_bytes: None,
                    sha256: None,
                },
                RemoteFile {
                    url: "https://example.test/b".to_string(),
                    path: "weights/model.bin".to_string(),
                    size_bytes: None,
                    sha256: None,
                },
            ],
        };
        assert!(store.status(&overlapping).is_err());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_replace_file_atomically_replaces_an_existing_target() {
        let root = TempDir::new().unwrap();
        let target = root.path().join("model.bin");
        let part = root.path().join("model.bin.part");
        fs::write(&target, b"old").unwrap();
        fs::write(&part, b"new").unwrap();

        replace_file(&part, &target).await.unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert!(!part.exists());
    }

    #[test]
    fn local_status_does_not_require_a_configured_download_url() {
        let root = TempDir::new().unwrap();
        let store = ModelStore::new(root.path());
        let spec = ModelSpec {
            id: "offline_model".to_string(),
            files: vec![RemoteFile {
                url: "looper-model-mirror-unconfigured://weights.bin".to_string(),
                path: "weights.bin".to_string(),
                size_bytes: Some(4),
                sha256: None,
            }],
        };
        let directory = root.path().join("offline_model");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("weights.bin"), b"data").unwrap();

        let status = store.status(&spec).unwrap();
        let resolved = store.resolve(&spec).unwrap();

        assert!(status.installed);
        assert_eq!(resolved.directory, directory);
    }

    #[tokio::test]
    async fn install_requires_an_http_download_url() {
        let root = TempDir::new().unwrap();
        let store = ModelStore::new(root.path());
        let spec = ModelSpec {
            id: "offline_model".to_string(),
            files: vec![RemoteFile {
                url: "looper-model-mirror-unconfigured://weights.bin".to_string(),
                path: "weights.bin".to_string(),
                size_bytes: Some(4),
                sha256: None,
            }],
        };

        let error = store
            .install(&spec, InstallOptions::default())
            .await
            .expect_err("download must reject an unconfigured mirror");

        assert_eq!(error.kind(), crate::ErrorKind::Validation);
        assert!(error.to_string().contains("HTTP or HTTPS"));
    }

    #[tokio::test]
    async fn public_operations_classify_errors_by_context() {
        let invalid_spec = ModelSpec {
            id: "../outside".to_string(),
            files: vec![],
        };
        let valid_spec = spec("http://127.0.0.1:9/model.bin".to_string(), b"model-body");
        let valid_root = TempDir::new().unwrap();
        let valid_store = ModelStore::new(valid_root.path());

        assert_eq!(
            valid_store.status(&invalid_spec).unwrap_err().kind(),
            crate::ErrorKind::Validation
        );
        assert_eq!(
            valid_store.resolve(&invalid_spec).unwrap_err().kind(),
            crate::ErrorKind::Validation
        );
        assert_eq!(
            valid_store.resolve(&valid_spec).unwrap_err().kind(),
            crate::ErrorKind::Validation
        );
        assert_eq!(
            valid_store.delete("../outside").unwrap_err().kind(),
            crate::ErrorKind::Validation
        );
        assert_eq!(
            valid_store
                .install(&invalid_spec, InstallOptions::default())
                .await
                .unwrap_err()
                .kind(),
            crate::ErrorKind::Validation
        );
        assert!(!valid_store.cancel("../outside"));

        let invalid_root = valid_root.path().join("not-a-directory");
        fs::write(&invalid_root, b"file").unwrap();
        let invalid_root_store = ModelStore::new(invalid_root);
        assert_eq!(
            invalid_root_store
                .install(&valid_spec, InstallOptions::default())
                .await
                .unwrap_err()
                .kind(),
            crate::ErrorKind::Download
        );
    }

    #[tokio::test]
    async fn downloads_verifies_and_atomically_replaces_existing_file() {
        let root = TempDir::new().unwrap();
        let body = b"new-model".to_vec();
        let (url, request, server) = spawn_server(body.clone(), ServerMode::HonorRange);
        let spec = spec(url, &body);
        let target = target_path(&root);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, b"old-model").unwrap();
        let store = ModelStore::new(root.path());
        let events = Mutex::new(Vec::new());
        let progress = |event| events.lock().unwrap().push(event);

        let status = store
            .install(
                &spec,
                InstallOptions {
                    cancel_token: None,
                    progress: Some(&progress),
                },
            )
            .await
            .unwrap();

        assert!(status.installed);
        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(!sibling_with_suffix(&target, ".part").unwrap().exists());
        let events = events.into_inner().unwrap();
        let verifying: Vec<_> = events.iter().filter(|event| event.verifying).collect();
        assert_eq!(verifying.len(), 1);
        assert_eq!(verifying[0].file, "");
        assert_eq!(verifying[0].percent, 100.0);
        assert!(!request.recv().unwrap().contains("range:"));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn resumes_a_partial_file_with_range() {
        let root = TempDir::new().unwrap();
        let body = b"complete-model-body".to_vec();
        let (url, request, server) = spawn_server(body.clone(), ServerMode::HonorRange);
        let spec = spec(url, &body);
        let target = target_path(&root);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(sibling_with_suffix(&target, ".part").unwrap(), &body[..8]).unwrap();
        let store = ModelStore::new(root.path());

        store
            .install(&spec, InstallOptions::default())
            .await
            .unwrap();

        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(request.recv().unwrap().contains("range: bytes=8-"));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn retries_an_interrupted_response_and_resumes_from_the_part_file() {
        let root = TempDir::new().unwrap();
        let body = b"complete-model-body".to_vec();
        let (url, requests, server) = spawn_server(body.clone(), ServerMode::InterruptOnce);
        let spec = spec(url, &body);
        let target = target_path(&root);
        let store = ModelStore::new(root.path());

        store
            .install(&spec, InstallOptions::default())
            .await
            .unwrap();

        let first_request = requests.recv().unwrap();
        let resumed_request = requests.recv().unwrap();
        assert!(!first_request.contains("range:"));
        assert!(resumed_request.contains("range: bytes=8-"));
        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(!sibling_with_suffix(&target, ".part").unwrap().exists());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn restarts_when_the_server_ignores_range() {
        let root = TempDir::new().unwrap();
        let body = b"complete-model-body".to_vec();
        let (url, request, server) = spawn_server(body.clone(), ServerMode::IgnoreRange);
        let spec = spec(url, &body);
        let target = target_path(&root);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(sibling_with_suffix(&target, ".part").unwrap(), &body[..8]).unwrap();
        let store = ModelStore::new(root.path());

        store
            .install(&spec, InstallOptions::default())
            .await
            .unwrap();

        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(request.recv().unwrap().contains("range: bytes=8-"));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn checksum_failure_preserves_the_previous_file() {
        let root = TempDir::new().unwrap();
        let body = b"bad-body".to_vec();
        let expected = b"new-body";
        let (url, _request, server) = spawn_server(body.clone(), ServerMode::HonorRange);
        let mut spec = spec(url, &body);
        spec.files[0].sha256 = Some(sha256(expected));
        let target = target_path(&root);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, b"old-body").unwrap();
        let store = ModelStore::new(root.path());

        let error = store
            .install(&spec, InstallOptions::default())
            .await
            .unwrap_err();

        assert!(matches!(error, Error::Checksum { .. }));
        assert_eq!(fs::read(&target).unwrap(), b"old-body");
        assert!(!sibling_with_suffix(&target, ".part").unwrap().exists());
        server.join().unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancellation_keeps_the_partial_file_for_a_future_resume() {
        let root = TempDir::new().unwrap();
        let body = vec![42u8; 1024 * 1024];
        let (url, request, _server) = spawn_server(body.clone(), ServerMode::Slow);
        let spec = spec(url, &body);
        let target = target_path(&root);
        let part = sibling_with_suffix(&target, ".part").unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&part, &body[..8]).unwrap();
        let store = ModelStore::new(root.path());
        let install_store = store.clone();

        let install = tokio::spawn(async move {
            install_store
                .install(&spec, InstallOptions::default())
                .await
        });
        request.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(store.cancel("test_model"));

        let error = install.await.unwrap().unwrap_err();
        assert!(matches!(error, Error::Cancelled(_)));
        assert_eq!(error.kind(), crate::ErrorKind::Cancelled);
        assert!(part.is_file());
        assert!(regular_file_size(&part).unwrap().unwrap() >= 8);
        assert!(!target.exists());
        assert!(!store.cancel("test_model"));
    }

    #[tokio::test]
    async fn cancellation_interrupts_retry_backoff() {
        let operation_token = CancellationToken::new();
        operation_token.cancel();
        let mut retry_count = 0;

        let error = retry_after_failure(
            &mut retry_count,
            "transient failure".to_string(),
            "test_model",
            &operation_token,
            None,
        )
        .await
        .unwrap_err();

        assert!(matches!(error, Error::Cancelled(_)));
        assert_eq!(error.kind(), crate::ErrorKind::Cancelled);
        assert_eq!(retry_count, 1);
    }

    #[test]
    fn status_and_resolve_use_declared_files() {
        let root = TempDir::new().unwrap();
        let body = b"ready";
        let spec = spec("https://example.test/model".to_string(), body);
        let target = target_path(&root);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, body).unwrap();
        let store = ModelStore::new(root.path());

        let status = store.status(&spec).unwrap();
        let resolved = store.resolve(&spec).unwrap();

        assert!(status.installed);
        assert_eq!(resolved.directory, root.path().join("test_model"));
        assert_eq!(resolved.files, vec![target]);
    }

    #[test]
    fn parses_satisfied_and_unsatisfied_content_ranges() {
        assert_eq!(
            parse_content_range("bytes 10-19/20").unwrap().start,
            Some(10)
        );
        let unsatisfied = parse_content_range("bytes */20").unwrap();
        assert_eq!(unsatisfied.start, None);
        assert_eq!(unsatisfied.total, Some(20));
        assert!(parse_content_range("items 0-1/2").is_err());
        assert!(parse_content_range("bytes 2-1/3").is_err());
    }
}
