//! Local control-channel server owned by the running desktop application.

use std::io::{BufRead, BufReader, Write};
use std::time::Duration;

use interprocess::local_socket::{prelude::*, ListenerOptions};
use tauri::AppHandle;

use super::handlers;
use super::ipc::{socket_name, Request, Response};
use crate::AppRuntime;

const SERVER_THREAD_NAME: &str = "looper-cli-ipc";
const STALE_ADDRESS_RECLAIM_WAIT: Duration = Duration::from_millis(250);

enum ListenerClaim {
    Owned(LocalSocketListener),
    ServedByAnotherInstance,
}

enum IncomingFrame {
    Empty,
    Request(Request),
    Rejected(Response),
}

pub(crate) fn start(app: AppHandle<AppRuntime>) {
    let spawned = std::thread::Builder::new()
        .name(SERVER_THREAD_NAME.to_owned())
        .spawn(move || {
            if let Err(error) = serve(app) {
                tracing::warn!("CLI control socket unavailable: {error}");
            }
        });
    if let Err(error) = spawned {
        tracing::warn!("Failed to spawn CLI control socket thread: {error}");
    }
}

fn serve(app: AppHandle<AppRuntime>) -> std::io::Result<()> {
    super::ipc::init_socket_label(&app.config().identifier);
    let listener = match claim_listener()? {
        ListenerClaim::Owned(listener) => listener,
        ListenerClaim::ServedByAnotherInstance => return Ok(()),
    };

    tracing::info!("CLI control socket listening");
    accept_connections(listener, app)
}

fn claim_listener() -> std::io::Result<ListenerClaim> {
    match ListenerOptions::new().name(socket_name()?).create_sync() {
        Ok(listener) => Ok(ListenerClaim::Owned(listener)),
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => resolve_occupied_address(),
        Err(error) => Err(error),
    }
}

fn resolve_occupied_address() -> std::io::Result<ListenerClaim> {
    if LocalSocketStream::connect(socket_name()?).is_ok() {
        tracing::debug!("CLI control socket already served by another instance");
        return Ok(ListenerClaim::ServedByAnotherInstance);
    }

    tracing::warn!("CLI control socket address in use but unreachable; reclaiming");
    ListenerOptions::new()
        .name(socket_name()?)
        .try_overwrite(true)
        .max_spin_time(STALE_ADDRESS_RECLAIM_WAIT)
        .create_sync()
        .map(ListenerClaim::Owned)
}

fn accept_connections(
    listener: LocalSocketListener,
    app: AppHandle<AppRuntime>,
) -> std::io::Result<()> {
    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => spawn_connection_handler(app.clone(), stream),
            Err(error) => tracing::debug!("CLI control socket accept error: {error}"),
        }
    }
    Ok(())
}

fn spawn_connection_handler(app: AppHandle<AppRuntime>, stream: LocalSocketStream) {
    std::thread::spawn(move || {
        if let Err(error) = handle_connection(&app, stream) {
            tracing::debug!("CLI control socket connection error: {error}");
        }
    });
}

fn handle_connection(
    app: &AppHandle<AppRuntime>,
    stream: LocalSocketStream,
) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let response = match decode_frame(&line) {
        IncomingFrame::Empty => return Ok(()),
        IncomingFrame::Request(request) => handlers::dispatch(app, &request),
        IncomingFrame::Rejected(response) => response,
    };

    let mut stream = reader.into_inner();
    stream.write_all(encode_frame(&response).as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn decode_frame(line: &str) -> IncomingFrame {
    let frame = line.trim();
    if frame.is_empty() {
        return IncomingFrame::Empty;
    }

    match serde_json::from_str::<Request>(frame) {
        Ok(request) => IncomingFrame::Request(request),
        Err(error) => {
            IncomingFrame::Rejected(Response::error(format!("Malformed request: {error}")))
        }
    }
}

fn encode_frame(response: &Response) -> String {
    let payload = serde_json::to_string(response).unwrap_or_else(|error| {
        serde_json::to_string(&Response::error(format!(
            "failed to serialize response: {error}"
        )))
        .unwrap_or_else(|_| r#"{"ok":false,"error":"internal serialization failure"}"#.to_owned())
    });
    format!("{payload}\n")
}

#[cfg(test)]
mod tests {
    use super::{decode_frame, encode_frame, IncomingFrame};
    use crate::integrations::ipc::Response;

    #[test]
    fn blank_connection_frame_is_ignored() {
        assert!(matches!(decode_frame("  \r\n"), IncomingFrame::Empty));
    }

    #[test]
    fn request_frame_accepts_newline_delimited_json() {
        let frame = decode_frame("{\"command\":\"status\",\"args\":{}}\n");
        let IncomingFrame::Request(request) = frame else {
            panic!("expected decoded request");
        };

        assert_eq!(request.command, "status");
        assert_eq!(request.args, serde_json::json!({}));
    }

    #[test]
    fn malformed_frame_returns_the_established_wire_error() {
        let IncomingFrame::Rejected(response) = decode_frame("not-json\n") else {
            panic!("expected rejected request");
        };

        assert!(!response.ok);
        assert!(response.error.unwrap().starts_with("Malformed request: "));
    }

    #[test]
    fn response_frame_is_compact_json_with_one_terminal_newline() {
        let encoded = encode_frame(&Response::ok(serde_json::json!({ "pong": true })));

        assert_eq!(encoded, "{\"ok\":true,\"data\":{\"pong\":true}}\n");
    }
}
