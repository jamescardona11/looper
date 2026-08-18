//! Local JSON-line transport used by CLI commands that need the desktop runtime.

use std::io::{BufRead, BufReader, Read, Write};
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use interprocess::local_socket::{prelude::*, Stream};
use serde_json::Value;

use super::coded;
use super::ipc::{socket_name, Request, Response};

const STARTUP_LIMIT: Duration = Duration::from_secs(20);
const RETRY_DELAY: Duration = Duration::from_millis(200);

pub(crate) fn request(command: &str, args: Value) -> Result<Response> {
    request_with_runtime(&mut DesktopRuntime, command, args)
}

pub(crate) fn request_data(command: &str, args: Value) -> Result<Value> {
    response_data(request(command, args)?)
}

pub(crate) fn try_request(command: &str, args: Value) -> Result<Option<Response>> {
    try_request_with_runtime(&mut DesktopRuntime, command, args)
}

fn response_data(response: Response) -> Result<Value> {
    if response.ok {
        return Ok(response.data);
    }

    Err(coded(
        3,
        response
            .error
            .unwrap_or_else(|| "Looper reported an error".to_owned()),
    ))
}

trait RuntimeAccess {
    type Channel: Read + Write;

    fn connect(&mut self) -> Option<Self::Channel>;
    fn launch(&mut self) -> Result<()>;
    fn now(&self) -> Instant;
    fn pause(&mut self, duration: Duration);
}

struct DesktopRuntime;

impl RuntimeAccess for DesktopRuntime {
    type Channel = Stream;

    fn connect(&mut self) -> Option<Self::Channel> {
        let address = socket_name().ok()?;
        Stream::connect(address).ok()
    }

    fn launch(&mut self) -> Result<()> {
        launch_desktop()
    }

    fn now(&self) -> Instant {
        Instant::now()
    }

    fn pause(&mut self, duration: Duration) {
        std::thread::sleep(duration);
    }
}

#[derive(Clone, Copy)]
struct ConnectionPolicy {
    startup_limit: Duration,
    retry_delay: Duration,
}

impl ConnectionPolicy {
    const fn standard() -> Self {
        Self {
            startup_limit: STARTUP_LIMIT,
            retry_delay: RETRY_DELAY,
        }
    }

    fn acquire<R: RuntimeAccess>(self, runtime: &mut R) -> Result<R::Channel> {
        if let Some(channel) = runtime.connect() {
            return Ok(channel);
        }

        runtime.launch().map_err(|error| {
            coded(
                2,
                format!("Looper is not running and could not be launched: {error}"),
            )
        })?;
        let deadline = runtime.now() + self.startup_limit;

        loop {
            runtime.pause(self.retry_delay);
            if let Some(channel) = runtime.connect() {
                return Ok(channel);
            }
            if runtime.now() >= deadline {
                return Err(coded(
                    2,
                    "Looper did not finish starting up in time. Try again in a moment.",
                ));
            }
        }
    }
}

fn request_with_runtime<R: RuntimeAccess>(
    runtime: &mut R,
    command: &str,
    args: Value,
) -> Result<Response> {
    let channel = ConnectionPolicy::standard().acquire(runtime)?;
    exchange(channel, command, args)
}

fn try_request_with_runtime<R: RuntimeAccess>(
    runtime: &mut R,
    command: &str,
    args: Value,
) -> Result<Option<Response>> {
    let Some(channel) = runtime.connect() else {
        return Ok(None);
    };
    exchange(channel, command, args).map(Some)
}

fn exchange<C: Read + Write>(mut channel: C, command: &str, args: Value) -> Result<Response> {
    let mut outbound = serde_json::to_string(&Request::new(command, args))?;
    outbound.push('\n');
    channel
        .write_all(outbound.as_bytes())
        .context("Failed to send request to Looper")?;
    channel
        .flush()
        .context("Failed to flush request to Looper")?;

    let mut inbound = String::new();
    BufReader::new(channel)
        .read_line(&mut inbound)
        .context("Failed to read response from Looper")?;
    let inbound = inbound.trim();
    if inbound.is_empty() {
        bail!("Looper closed the connection without responding");
    }

    serde_json::from_str(inbound).context("Looper returned a malformed response")
}

fn launch_desktop() -> Result<()> {
    let executable = std::env::current_exe().context("Could not resolve the Looper binary path")?;

    #[cfg(target_os = "macos")]
    if let Some(bundle) = enclosing_app_bundle(&executable) {
        return spawn_bundle(bundle);
    }

    spawn_executable(executable)
}

#[cfg(target_os = "macos")]
fn spawn_bundle(bundle: std::path::PathBuf) -> Result<()> {
    use std::process::Stdio;

    std::process::Command::new("/usr/bin/open")
        .arg(bundle)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Failed to launch Looper via `open`")?;
    Ok(())
}

fn spawn_executable(executable: std::path::PathBuf) -> Result<()> {
    use std::process::Stdio;

    std::process::Command::new(&executable)
        .env_remove("LOOPER_CLI_SHIM")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("Failed to launch {}", executable.display()))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn enclosing_app_bundle(executable: &std::path::Path) -> Option<std::path::PathBuf> {
    executable
        .ancestors()
        .skip(1)
        .find(|ancestor| ancestor.extension().and_then(|value| value.to_str()) == Some("app"))
        .map(std::path::Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::io::{Cursor, Read, Write};

    use super::*;
    use crate::integrations::CodedError;

    struct ScriptedChannel {
        inbound: Cursor<Vec<u8>>,
        outbound: Vec<u8>,
    }

    impl ScriptedChannel {
        fn responding(line: &str) -> Self {
            Self {
                inbound: Cursor::new(line.as_bytes().to_vec()),
                outbound: Vec::new(),
            }
        }
    }

    impl Read for ScriptedChannel {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            self.inbound.read(buffer)
        }
    }

    impl Write for ScriptedChannel {
        fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
            self.outbound.extend_from_slice(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    struct FakeRuntime {
        connections: VecDeque<Option<ScriptedChannel>>,
        clock: Instant,
        launch_error: Option<&'static str>,
        launches: usize,
        pauses: usize,
    }

    impl FakeRuntime {
        fn new(connections: impl IntoIterator<Item = Option<ScriptedChannel>>) -> Self {
            Self {
                connections: connections.into_iter().collect(),
                clock: Instant::now(),
                launch_error: None,
                launches: 0,
                pauses: 0,
            }
        }
    }

    impl RuntimeAccess for FakeRuntime {
        type Channel = ScriptedChannel;

        fn connect(&mut self) -> Option<Self::Channel> {
            self.connections.pop_front().flatten()
        }

        fn launch(&mut self) -> Result<()> {
            self.launches += 1;
            match self.launch_error.take() {
                Some(message) => Err(anyhow::anyhow!(message)),
                None => Ok(()),
            }
        }

        fn now(&self) -> Instant {
            self.clock
        }

        fn pause(&mut self, duration: Duration) {
            self.pauses += 1;
            self.clock += duration;
        }
    }

    fn coded_error(error: &anyhow::Error) -> &CodedError {
        error.downcast_ref::<CodedError>().unwrap()
    }

    #[test]
    fn exchange_writes_one_json_line_and_decodes_one_response() {
        let mut channel =
            ScriptedChannel::responding("{\"ok\":true,\"data\":{\"running\":true}}\nignored\n");

        let response = exchange(&mut channel, "status", serde_json::json!({})).unwrap();

        assert!(response.ok);
        assert_eq!(response.data, serde_json::json!({ "running": true }));
        assert_eq!(
            String::from_utf8(channel.outbound).unwrap(),
            "{\"command\":\"status\",\"args\":{}}\n"
        );
    }

    #[test]
    fn exchange_distinguishes_closed_and_malformed_responses() {
        let closed = exchange(
            ScriptedChannel::responding(" \n"),
            "status",
            serde_json::json!({}),
        )
        .unwrap_err();
        let malformed = exchange(
            ScriptedChannel::responding("not-json\n"),
            "status",
            serde_json::json!({}),
        )
        .unwrap_err();

        assert_eq!(
            closed.to_string(),
            "Looper closed the connection without responding"
        );
        assert_eq!(
            malformed.to_string(),
            "Looper returned a malformed response"
        );
    }

    #[test]
    fn response_data_keeps_success_and_job_failure_contracts() {
        assert_eq!(
            response_data(Response::ok(serde_json::json!({ "id": 7 }))).unwrap(),
            serde_json::json!({ "id": 7 })
        );

        let explicit = response_data(Response::error("model unavailable")).unwrap_err();
        assert_eq!(coded_error(&explicit).code, 3);
        assert_eq!(coded_error(&explicit).message, "model unavailable");

        let fallback = response_data(Response {
            ok: false,
            data: Value::Null,
            error: None,
        })
        .unwrap_err();
        assert_eq!(coded_error(&fallback).code, 3);
        assert_eq!(coded_error(&fallback).message, "Looper reported an error");
    }

    #[test]
    fn request_launches_only_after_the_initial_probe_fails() {
        let response = ScriptedChannel::responding("{\"ok\":true,\"data\":\"ready\"}\n");
        let mut runtime = FakeRuntime::new([None, Some(response)]);

        let result = request_with_runtime(&mut runtime, "status", serde_json::json!({})).unwrap();

        assert_eq!(result.data, "ready");
        assert_eq!(runtime.launches, 1);
        assert_eq!(runtime.pauses, 1);
    }

    #[test]
    fn try_request_never_launches_when_the_socket_is_absent() {
        let mut runtime = FakeRuntime::new([None]);

        let result =
            try_request_with_runtime(&mut runtime, "status", serde_json::json!({})).unwrap();

        assert!(result.is_none());
        assert_eq!(runtime.launches, 0);
        assert_eq!(runtime.pauses, 0);
    }

    #[test]
    fn launch_and_startup_failures_keep_exit_code_two() {
        let mut launch_failure = FakeRuntime::new([None]);
        launch_failure.launch_error = Some("permission denied");
        let error =
            request_with_runtime(&mut launch_failure, "status", serde_json::json!({})).unwrap_err();
        assert_eq!(coded_error(&error).code, 2);
        assert_eq!(
            coded_error(&error).message,
            "Looper is not running and could not be launched: permission denied"
        );

        let mut timeout = FakeRuntime::new(std::iter::repeat_with(|| None).take(102));
        let error =
            request_with_runtime(&mut timeout, "status", serde_json::json!({})).unwrap_err();
        assert_eq!(coded_error(&error).code, 2);
        assert_eq!(
            coded_error(&error).message,
            "Looper did not finish starting up in time. Try again in a moment."
        );
        assert_eq!(timeout.pauses, 100);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn app_bundle_discovery_walks_ancestors_without_accepting_plain_directories() {
        let bundled = std::path::Path::new("/Applications/Looper.app/Contents/MacOS/Looper");
        let standalone = std::path::Path::new("/usr/local/bin/looper");

        assert_eq!(
            enclosing_app_bundle(bundled),
            Some(std::path::PathBuf::from("/Applications/Looper.app"))
        );
        assert_eq!(enclosing_app_bundle(standalone), None);
    }
}
