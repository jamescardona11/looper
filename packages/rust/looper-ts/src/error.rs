use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    Load,
    Inference,
    Download,
    Validation,
    Cancelled,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("model load error: {0}")]
    Load(String),

    #[error("inference error: {0}")]
    Inference(String),

    #[error("validation error: {0}")]
    Validation(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("ONNX Runtime error: {0}")]
    Ort(ort::Error),

    #[error("audio error: {0}")]
    Audio(String),

    #[error("model error: {0}")]
    Model(String),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("download error: {0}")]
    Download(String),

    #[error("checksum mismatch for {path}: expected SHA-256 {expected}, calculated {actual}")]
    Checksum {
        path: PathBuf,
        expected: String,
        actual: String,
    },

    #[error("operation cancelled: {0}")]
    Cancelled(String),
}

impl Error {
    pub fn kind(&self) -> ErrorKind {
        match self {
            Self::Load(_) | Self::Io(_) => ErrorKind::Load,
            Self::Inference(_) | Self::Ort(_) | Self::Model(_) => ErrorKind::Inference,
            Self::Download(_) | Self::Checksum { .. } => ErrorKind::Download,
            Self::Validation(_) | Self::Audio(_) | Self::Config(_) => ErrorKind::Validation,
            Self::Cancelled(_) => ErrorKind::Cancelled,
        }
    }

    pub(crate) fn during_load(error: Self) -> Self {
        match error {
            Self::Load(_) | Self::Validation(_) | Self::Cancelled(_) => error,
            other => Self::Load(other.to_string()),
        }
    }

    pub(crate) fn during_inference(error: Self) -> Self {
        match error {
            Self::Inference(_) | Self::Validation(_) | Self::Cancelled(_) => error,
            other => Self::Inference(other.to_string()),
        }
    }
}

impl<R> From<ort::Error<R>> for Error
where
    ort::Error<R>: Into<ort::Error>,
{
    fn from(error: ort::Error<R>) -> Self {
        Self::Ort(error.into())
    }
}

impl From<ndarray::ShapeError> for Error {
    fn from(error: ndarray::ShapeError) -> Self {
        Self::Model(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_error_kinds_are_stable_across_internal_sources() {
        assert_eq!(
            Error::during_load(Error::Model("missing weights".to_string())).kind(),
            ErrorKind::Load
        );
        assert_eq!(
            Error::during_inference(Error::Model("bad tensor".to_string())).kind(),
            ErrorKind::Inference
        );
        assert_eq!(
            Error::Validation("bad input".to_string()).kind(),
            ErrorKind::Validation
        );
        assert_eq!(
            Error::Download("offline".to_string()).kind(),
            ErrorKind::Download
        );
        assert_eq!(
            Error::Cancelled("install".to_string()).kind(),
            ErrorKind::Cancelled
        );
    }
}
