// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const SIDECAR_FLAG: &str = "--local-llm-sidecar";
const WINDOWS_CLI_SHIM_ENV: &str = "LOOPER_CLI_SHIM";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EntryPoint {
    Application,
    CommandLine,
    LocalLlmSidecar,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostFamily {
    Unix,
    Windows,
    Other,
}

fn main() {
    match detect_entry_point() {
        EntryPoint::Application => looper_lib::run(),
        EntryPoint::CommandLine => finish(looper_lib::run_cli()),
        EntryPoint::LocalLlmSidecar => finish(looper_lib::run_local_llm_sidecar()),
    }
}

fn finish<Error: std::fmt::Debug>(result: Result<(), Error>) {
    if let Err(error) = result {
        eprintln!("{error:?}");
        std::process::exit(1);
    }
}

fn detect_entry_point() -> EntryPoint {
    let arguments = std::env::args_os().collect::<Vec<_>>();
    let has_sidecar_flag = arguments.iter().any(|value| value == SIDECAR_FLAG);
    let executable_stem = arguments
        .first()
        .and_then(|value| std::path::Path::new(value).file_stem())
        .and_then(|value| value.to_str());
    let windows_shim = std::env::var_os(WINDOWS_CLI_SHIM_ENV).is_some();

    classify_invocation(
        executable_stem,
        has_sidecar_flag,
        windows_shim,
        host_family(),
    )
}

fn classify_invocation(
    stem: Option<&str>,
    has_sidecar_flag: bool,
    windows_shim: bool,
    host: HostFamily,
) -> EntryPoint {
    if has_sidecar_flag {
        return EntryPoint::LocalLlmSidecar;
    }
    let Some(stem) = stem else {
        return EntryPoint::Application;
    };
    let explicit_cli = stem == "looper-cli";
    let platform_cli = match host {
        HostFamily::Unix => stem == "looper",
        HostFamily::Windows => windows_shim,
        HostFamily::Other => false,
    };
    if explicit_cli || platform_cli {
        EntryPoint::CommandLine
    } else {
        EntryPoint::Application
    }
}

const fn host_family() -> HostFamily {
    if cfg!(windows) {
        HostFamily::Windows
    } else if cfg!(unix) {
        HostFamily::Unix
    } else {
        HostFamily::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidecar_flag_has_priority_over_binary_name() {
        assert_eq!(
            classify_invocation(Some("Looper"), true, false, HostFamily::Unix),
            EntryPoint::LocalLlmSidecar
        );
    }

    #[test]
    fn unix_distinguishes_installed_cli_symlink_from_app_binary() {
        assert_eq!(
            classify_invocation(Some("looper"), false, false, HostFamily::Unix),
            EntryPoint::CommandLine
        );
        assert_eq!(
            classify_invocation(Some("Looper"), false, false, HostFamily::Unix),
            EntryPoint::Application
        );
    }

    #[test]
    fn windows_requires_the_shim_or_explicit_cli_binary() {
        assert_eq!(
            classify_invocation(Some("Looper"), false, true, HostFamily::Windows),
            EntryPoint::CommandLine
        );
        assert_eq!(
            classify_invocation(Some("Looper"), false, false, HostFamily::Windows),
            EntryPoint::Application
        );
        assert_eq!(
            classify_invocation(Some("looper-cli"), false, false, HostFamily::Other),
            EntryPoint::CommandLine
        );
    }

    #[test]
    fn missing_or_non_utf8_executable_defaults_to_application() {
        assert_eq!(
            classify_invocation(None, false, false, HostFamily::Unix),
            EntryPoint::Application
        );
    }
}
