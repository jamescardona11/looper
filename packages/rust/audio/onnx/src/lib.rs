mod error;
pub use error::*;

use ort::{
    Result,
    session::{Session, builder::GraphOptimizationLevel},
};

pub use ndarray;
pub use ort;

pub fn load_model_from_bytes(bytes: &[u8]) -> Result<Session, Error> {
    let builder = Session::builder()?;
    let builder = builder
        .with_intra_threads(1)
        .map_err(ort::Error::from)?;
    let builder = builder
        .with_inter_threads(1)
        .map_err(ort::Error::from)?;
    let mut builder = builder
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(ort::Error::from)?;
    Ok(builder.commit_from_memory(bytes)?)
}

pub fn load_model_from_path(path: impl AsRef<std::path::Path>) -> Result<Session, Error> {
    let bytes = std::fs::read(path)?;
    load_model_from_bytes(&bytes)
}
