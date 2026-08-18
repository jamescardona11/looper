//! Data protocol and address identity for the local CLI control channel.

use std::sync::OnceLock;

use interprocess::local_socket::{GenericNamespaced, Name, ToNsName};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct Request {
    pub command: String,
    #[serde(default)]
    pub args: Value,
}

impl Request {
    pub fn new(command: impl Into<String>, args: Value) -> Self {
        Self::from_parts(command.into(), args)
    }

    fn from_parts(command: String, args: Value) -> Self {
        Self { command, args }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub data: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Response {
    pub fn ok(data: Value) -> Self {
        Self::from_body(ResponseBody::Success(data))
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self::from_body(ResponseBody::Failure(message.into()))
    }

    fn from_body(body: ResponseBody) -> Self {
        match body {
            ResponseBody::Success(data) => Self {
                ok: true,
                data,
                error: None,
            },
            ResponseBody::Failure(message) => Self {
                ok: false,
                data: Value::Null,
                error: Some(message),
            },
        }
    }
}

enum ResponseBody {
    Success(Value),
    Failure(String),
}

struct SocketIdentity {
    user: String,
    application: String,
}

impl SocketIdentity {
    fn from_environment(identifier: &str) -> Self {
        let raw_user = std::env::var("USER")
            .or_else(|_| std::env::var("USERNAME"))
            .unwrap_or_default();
        Self::new(&raw_user, identifier)
    }

    fn new(user: &str, identifier: &str) -> Self {
        let user = sanitized_segment(user);
        Self {
            user: if user.is_empty() {
                "default".to_owned()
            } else {
                user
            },
            application: sanitized_segment(identifier),
        }
    }

    fn socket_label(&self) -> String {
        format!("looper-cli-{}-{}.sock", self.user, self.application)
    }
}

static CONTROL_SOCKET_LABEL: OnceLock<String> = OnceLock::new();

pub(crate) fn init_socket_label(identifier: &str) {
    CONTROL_SOCKET_LABEL
        .get_or_init(|| SocketIdentity::from_environment(identifier).socket_label());
}

pub fn socket_name() -> std::io::Result<Name<'static>> {
    CONTROL_SOCKET_LABEL
        .get()
        .map(String::as_str)
        .unwrap_or("looper-cli-default.sock")
        .to_ns_name::<GenericNamespaced>()
}

fn sanitized_segment(raw: &str) -> String {
    raw.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{Request, Response, SocketIdentity};

    #[test]
    fn request_wire_shape_keeps_command_and_args() {
        let request = Request::new("status", serde_json::json!({ "verbose": true }));

        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({ "command": "status", "args": { "verbose": true } })
        );
    }

    #[test]
    fn response_constructors_preserve_the_wire_contract() {
        assert_eq!(
            serde_json::to_value(Response::ok(serde_json::json!({ "ready": true }))).unwrap(),
            serde_json::json!({ "ok": true, "data": { "ready": true } })
        );
        assert_eq!(
            serde_json::to_value(Response::error("unavailable")).unwrap(),
            serde_json::json!({ "ok": false, "error": "unavailable" })
        );
        assert_eq!(
            serde_json::to_value(Response::ok(serde_json::Value::Null)).unwrap(),
            serde_json::json!({ "ok": true })
        );
    }

    #[test]
    fn absent_optional_wire_fields_receive_protocol_defaults() {
        let request: Request = serde_json::from_value(serde_json::json!({
            "command": "status"
        }))
        .unwrap();
        let response: Response = serde_json::from_value(serde_json::json!({
            "ok": true
        }))
        .unwrap();

        assert!(request.args.is_null());
        assert!(response.data.is_null());
        assert!(response.error.is_none());
    }

    #[test]
    fn socket_identity_is_ascii_scoped_and_has_a_user_fallback() {
        assert_eq!(
            SocketIdentity::new("zo-ro!", "com.looper.desktop").socket_label(),
            "looper-cli-zoro-comlooperdesktop.sock"
        );
        assert_eq!(
            SocketIdentity::new("---", "dev.looper").socket_label(),
            "looper-cli-default-devlooper.sock"
        );
    }
}
