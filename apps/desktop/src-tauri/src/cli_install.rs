use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

use serde::Serialize;

const CLI_COMMAND: &str = "looper";
#[cfg(any(windows, test))]
const WINDOWS_TARGET_MARKER: &str = "REM looper-cli-target=";
#[cfg(any(windows, test))]
const WINDOWS_SHIM_ENVIRONMENT: &str = "LOOPER_CLI_SHIM";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInstallStatus {
    pub installed: bool,
    pub managed_by_app: bool,
    pub source_available: bool,
    pub install_path: Option<String>,
    pub source_path: Option<String>,
    pub command: String,
    pub path_in_shell: bool,
}

#[tauri::command]
pub fn get_cli_install_status() -> Result<CliInstallStatus, String> {
    Ok(current_status())
}

#[tauri::command]
pub fn install_cli(state: tauri::State<crate::AppState>) -> Result<CliInstallStatus, String> {
    crate::license::require_active_license(&state.settings_store, "the CLI")?;
    ResolvedInstall::for_creation()?.create()?;
    Ok(current_status())
}

#[tauri::command]
pub fn remove_cli() -> Result<CliInstallStatus, String> {
    ResolvedInstall::for_removal()?.remove()?;
    Ok(current_status())
}

struct ResolvedInstall {
    executable: PathBuf,
    launcher: PathBuf,
}

impl ResolvedInstall {
    fn for_creation() -> Result<Self, String> {
        let executable = source_executable()?;
        let launcher = preferred_launcher()?;
        Ok(Self {
            executable,
            launcher,
        })
    }

    fn for_removal() -> Result<Self, String> {
        // Removal historically resolves the destination first; keep that error precedence.
        let launcher = preferred_launcher()?;
        let executable = source_executable()?;
        Ok(Self {
            executable,
            launcher,
        })
    }

    fn create(&self) -> Result<(), String> {
        if let Some(directory) = self.launcher.parent() {
            fs::create_dir_all(directory)
                .map_err(|error| format!("Failed to create CLI install directory: {error}"))?;
        }

        self.clear_owned_destination()?;
        platform::write_launcher(&self.launcher, &self.executable)
            .map_err(|error| format!("Failed to install CLI: {error}"))
    }

    fn remove(&self) -> Result<(), String> {
        match inspect_destination(&self.launcher, &self.executable) {
            Ok(DestinationState::Missing) => Ok(()),
            Ok(DestinationState::Owned) => fs::remove_file(&self.launcher)
                .map_err(|error| format!("Failed to remove CLI shortcut: {error}")),
            Ok(DestinationState::Foreign) | Err(_) => Err(not_owned_message(&self.launcher)),
        }
    }

    fn clear_owned_destination(&self) -> Result<(), String> {
        match inspect_destination(&self.launcher, &self.executable) {
            Ok(DestinationState::Missing) => Ok(()),
            Ok(DestinationState::Owned) => fs::remove_file(&self.launcher)
                .map_err(|error| format!("Failed to replace existing CLI shortcut: {error}")),
            Ok(DestinationState::Foreign) => Err(conflict_message(&self.launcher)),
            Err(error) => Err(format!("Failed to inspect CLI install path: {error}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DestinationState {
    Missing,
    Owned,
    Foreign,
}

fn inspect_destination(launcher: &Path, executable: &Path) -> io::Result<DestinationState> {
    match fs::symlink_metadata(launcher) {
        Ok(metadata) => {
            let owned = platform::is_launcher_artifact(&metadata)
                && platform::launcher_targets(launcher, executable);
            Ok(if owned {
                DestinationState::Owned
            } else {
                DestinationState::Foreign
            })
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(DestinationState::Missing),
        Err(error) => Err(error),
    }
}

fn current_status() -> CliInstallStatus {
    let executable = source_executable().ok();
    let preferred = preferred_launcher().ok();
    let managed = preferred
        .as_deref()
        .zip(executable.as_deref())
        .is_some_and(|(launcher, source)| platform::launcher_targets(launcher, source));
    let external = if managed {
        None
    } else {
        executable.as_deref().and_then(find_visible_command)
    };
    let directory_visible = preferred
        .as_deref()
        .and_then(Path::parent)
        .is_some_and(shell_path_contains);

    assemble_status(executable, preferred, managed, external, directory_visible)
}

fn assemble_status(
    executable: Option<PathBuf>,
    preferred: Option<PathBuf>,
    managed: bool,
    external: Option<PathBuf>,
    directory_visible: bool,
) -> CliInstallStatus {
    let active_launcher = if managed { preferred.clone() } else { external };
    let path_in_shell = active_launcher.is_some() || directory_visible;

    CliInstallStatus {
        installed: active_launcher.is_some(),
        managed_by_app: managed,
        source_available: executable.is_some(),
        install_path: active_launcher.or(preferred).map(path_string),
        source_path: executable.map(path_string),
        command: CLI_COMMAND.to_owned(),
        path_in_shell,
    }
}

fn find_visible_command(executable: &Path) -> Option<PathBuf> {
    search_directories()
        .into_iter()
        .flat_map(platform::command_candidates)
        .find(|candidate| candidate.exists())
        .filter(|candidate| {
            same_path(candidate, executable) || platform::launcher_targets(candidate, executable)
        })
}

fn search_directories() -> Vec<PathBuf> {
    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
    let mut directories = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();

    #[cfg(target_os = "macos")]
    for fallback in ["/opt/homebrew/bin", "/usr/local/bin"] {
        push_distinct(&mut directories, PathBuf::from(fallback));
    }

    directories
}

#[cfg(target_os = "macos")]
fn push_distinct(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|existing| same_path(existing, &candidate)) {
        paths.push(candidate);
    }
}

fn source_executable() -> Result<PathBuf, String> {
    let executable =
        env::current_exe().map_err(|error| format!("Failed to resolve Looper binary: {error}"))?;
    if platform::is_executable(&executable) {
        Ok(executable)
    } else {
        Err("Looper binary is not executable".to_owned())
    }
}

fn preferred_launcher() -> Result<PathBuf, String> {
    Ok(user_home()?.join(platform::launcher_relative_path()))
}

fn user_home() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "Could not find your home directory".to_owned())
}

fn same_path(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }

    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => platform::canonical_paths_match(&left, &right),
        _ => false,
    }
}

fn shell_path_contains(directory: &Path) -> bool {
    env::var_os("PATH")
        .map(|value| env::split_paths(&value).any(|entry| same_path(&entry, directory)))
        .unwrap_or(false)
}

fn conflict_message(path: &Path) -> String {
    format!(
        "{} already exists and is not a Looper CLI shortcut",
        path.to_string_lossy()
    )
}

fn not_owned_message(path: &Path) -> String {
    format!("{} is not a Looper CLI shortcut", path.to_string_lossy())
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(any(windows, test))]
fn windows_shim_contents(executable: &Path) -> String {
    let executable = executable.to_string_lossy();
    format!(
        "@echo off\r\n{WINDOWS_TARGET_MARKER}{executable}\r\nset \"{WINDOWS_SHIM_ENVIRONMENT}=1\"\r\n\"{executable}\" %*\r\n"
    )
}

#[cfg(any(windows, test))]
fn windows_marker_target(content: &str) -> Option<PathBuf> {
    content.lines().find_map(|line| {
        line.trim()
            .strip_prefix(WINDOWS_TARGET_MARKER)
            .map(str::trim)
            .map(PathBuf::from)
    })
}

#[cfg(unix)]
mod platform {
    use std::{fs, io, os::unix::fs::PermissionsExt, path::Path};

    use super::PathBuf;

    pub(super) fn launcher_relative_path() -> PathBuf {
        PathBuf::from(".local/bin/looper")
    }

    pub(super) fn command_candidates(directory: PathBuf) -> Vec<PathBuf> {
        vec![directory.join(super::CLI_COMMAND)]
    }

    pub(super) fn write_launcher(launcher: &Path, executable: &Path) -> io::Result<()> {
        std::os::unix::fs::symlink(executable, launcher)
    }

    pub(super) fn is_launcher_artifact(metadata: &fs::Metadata) -> bool {
        metadata.file_type().is_symlink()
    }

    pub(super) fn launcher_targets(launcher: &Path, executable: &Path) -> bool {
        fs::read_link(launcher)
            .ok()
            .map(|target| absolute_link_target(launcher, &target))
            .is_some_and(|target| super::same_path(&target, executable))
    }

    fn absolute_link_target(launcher: &Path, target: &Path) -> PathBuf {
        if target.is_absolute() {
            return target.to_path_buf();
        }

        launcher
            .parent()
            .map(|directory| directory.join(target))
            .unwrap_or_else(|| target.to_path_buf())
    }

    pub(super) fn canonical_paths_match(left: &Path, right: &Path) -> bool {
        left == right
    }

    pub(super) fn is_executable(path: &Path) -> bool {
        path.metadata()
            .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
}

#[cfg(windows)]
mod platform {
    use std::{fs, io, path::Path};

    use super::PathBuf;

    pub(super) fn launcher_relative_path() -> PathBuf {
        PathBuf::from(".local/bin/looper.cmd")
    }

    pub(super) fn command_candidates(directory: PathBuf) -> Vec<PathBuf> {
        ["looper.cmd", "looper.exe"]
            .into_iter()
            .map(|name| directory.join(name))
            .collect()
    }

    pub(super) fn write_launcher(launcher: &Path, executable: &Path) -> io::Result<()> {
        fs::write(launcher, super::windows_shim_contents(executable))
    }

    pub(super) fn is_launcher_artifact(metadata: &fs::Metadata) -> bool {
        metadata.is_file()
    }

    pub(super) fn launcher_targets(launcher: &Path, executable: &Path) -> bool {
        fs::read_to_string(launcher)
            .ok()
            .and_then(|content| super::windows_marker_target(&content))
            .is_some_and(|target| super::same_path(&target, executable))
    }

    pub(super) fn canonical_paths_match(left: &Path, right: &Path) -> bool {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }

    pub(super) fn is_executable(path: &Path) -> bool {
        path.is_file()
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::symlink;

    use super::*;

    fn fixture() -> (tempfile::TempDir, ResolvedInstall) {
        let directory = tempfile::tempdir().expect("temporary CLI fixture");
        let executable = directory.path().join("Looper");
        fs::write(&executable, "binary").expect("write source executable");
        let launcher = directory.path().join("nested/bin/looper");
        (
            directory,
            ResolvedInstall {
                executable,
                launcher,
            },
        )
    }

    #[test]
    fn install_replaces_only_its_own_launcher_and_remove_is_idempotent() {
        let (_directory, installation) = fixture();

        installation.create().expect("first install");
        assert_eq!(
            inspect_destination(&installation.launcher, &installation.executable).unwrap(),
            DestinationState::Owned
        );

        installation.create().expect("replace owned install");
        installation.remove().expect("remove owned install");
        installation
            .remove()
            .expect("missing install is already removed");
        assert!(!installation.launcher.exists());
    }

    #[test]
    fn foreign_destination_keeps_the_existing_file_and_exact_errors() {
        let (_directory, installation) = fixture();
        fs::create_dir_all(installation.launcher.parent().unwrap()).unwrap();
        fs::write(&installation.launcher, "foreign").unwrap();

        assert_eq!(
            installation.create().unwrap_err(),
            conflict_message(&installation.launcher)
        );
        assert_eq!(
            installation.remove().unwrap_err(),
            not_owned_message(&installation.launcher)
        );
        assert_eq!(
            fs::read_to_string(&installation.launcher).unwrap(),
            "foreign"
        );
    }

    #[test]
    fn relative_symlink_is_owned_when_it_resolves_to_the_executable() {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("looper-real");
        let launcher = directory.path().join("looper");
        fs::write(&executable, "binary").unwrap();
        symlink("looper-real", &launcher).unwrap();

        assert!(platform::launcher_targets(&launcher, &executable));
    }

    #[test]
    fn windows_shim_contract_quotes_the_binary_and_forwards_arguments() {
        let executable = Path::new(r"C:\Program Files\Looper\Looper.exe");
        assert_eq!(
            windows_shim_contents(executable),
            concat!(
                "@echo off\r\n",
                "REM looper-cli-target=C:\\Program Files\\Looper\\Looper.exe\r\n",
                "set \"LOOPER_CLI_SHIM=1\"\r\n",
                "\"C:\\Program Files\\Looper\\Looper.exe\" %*\r\n"
            )
        );
    }

    #[test]
    fn windows_marker_parser_ignores_other_lines_and_trims_target() {
        let content = concat!(
            "@echo off\r\n",
            "  REM looper-cli-target= C:\\Looper\\Looper.exe  \r\n",
            "\"C:\\Looper\\Looper.exe\" %*\r\n"
        );
        assert_eq!(
            windows_marker_target(content),
            Some(PathBuf::from(r"C:\Looper\Looper.exe"))
        );
    }

    #[test]
    fn status_payload_distinguishes_managed_external_and_available() {
        let source = PathBuf::from("/Applications/Looper.app/Contents/MacOS/Looper");
        let preferred = PathBuf::from("/Users/test/.local/bin/looper");
        let external = PathBuf::from("/opt/homebrew/bin/looper");

        let managed = assemble_status(
            Some(source.clone()),
            Some(preferred.clone()),
            true,
            None,
            false,
        );
        assert!(managed.installed && managed.managed_by_app && managed.path_in_shell);
        assert_eq!(managed.install_path.as_deref(), preferred.to_str());

        let outside = assemble_status(
            Some(source.clone()),
            Some(preferred.clone()),
            false,
            Some(external.clone()),
            false,
        );
        assert!(outside.installed && !outside.managed_by_app && outside.path_in_shell);
        assert_eq!(outside.install_path.as_deref(), external.to_str());

        let available = assemble_status(Some(source), Some(preferred.clone()), false, None, false);
        assert!(!available.installed && !available.path_in_shell);
        assert!(available.source_available);
        assert_eq!(available.install_path.as_deref(), preferred.to_str());
        assert_eq!(available.command, CLI_COMMAND);
    }
}
