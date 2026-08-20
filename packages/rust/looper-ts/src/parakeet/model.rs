// Adapted from parakeet-rs 0.3.6 at revision
// 7deba612fc9a30c4a7182f4eaa53554cb2fa42c8.
// Copyright (c) 2025 Enes Altun. Licensed under MIT; see the root THIRD_PARTY_NOTICES.md.

use std::path::{Path, PathBuf};

use ndarray::{Array1, Array2, Array3};
use ort::session::Session;

use crate::{runtime, Error, ExecutionProvider, Result};

pub(super) struct ParakeetModel {
    encoder: Session,
    decoder_joint: Session,
    vocabulary_size: usize,
}

impl ParakeetModel {
    pub fn load(model_dir: &Path, vocabulary_size: usize) -> Result<Self> {
        let encoder_path = resolve_encoder(model_dir)?;
        let decoder_joint_path = resolve_decoder_joint(model_dir)?;

        Ok(Self {
            encoder: runtime::create_session(&encoder_path, ExecutionProvider::Cpu)?,
            decoder_joint: runtime::create_session(&decoder_joint_path, ExecutionProvider::Cpu)?,
            vocabulary_size,
        })
    }

    pub fn forward(
        &mut self,
        features: Array2<f32>,
    ) -> Result<(Vec<usize>, Vec<usize>, Vec<usize>)> {
        let (encoder_output, encoder_length) = self.run_encoder(&features)?;
        self.greedy_decode(&encoder_output, encoder_length)
    }

    fn run_encoder(&mut self, features: &Array2<f32>) -> Result<(Array3<f32>, usize)> {
        let time_steps = features.shape()[0];
        let feature_size = features.shape()[1];
        let input = features
            .t()
            .to_shape((1, feature_size, time_steps))
            .map_err(|error| {
                Error::Model(format!("failed to reshape Parakeet encoder input: {error}"))
            })?
            .to_owned();

        let outputs = self.encoder.run(ort::inputs!(
            "audio_signal" => ort::value::Value::from_array(input)?,
            "length" => ort::value::Value::from_array(Array1::from_vec(vec![time_steps as i64]))?
        ))?;
        let (shape, data) = outputs["outputs"]
            .try_extract_tensor::<f32>()
            .map_err(|error| {
                Error::Model(format!(
                    "failed to extract Parakeet encoder output: {error}"
                ))
            })?;
        let (_, lengths) = outputs["encoded_lengths"]
            .try_extract_tensor::<i64>()
            .map_err(|error| {
                Error::Model(format!(
                    "failed to extract Parakeet encoder length: {error}"
                ))
            })?;
        let dimensions = shape.as_ref();
        if dimensions.len() != 3 {
            return Err(Error::Model(format!(
                "expected a 3D Parakeet encoder output, got {dimensions:?}"
            )));
        }
        let encoded_length = lengths.first().copied().ok_or_else(|| {
            Error::Model("Parakeet encoder returned no encoded length".to_string())
        })?;
        let encoder_output = Array3::from_shape_vec(
            (
                dimensions[0] as usize,
                dimensions[1] as usize,
                dimensions[2] as usize,
            ),
            data.to_vec(),
        )
        .map_err(|error| Error::Model(format!("invalid Parakeet encoder output shape: {error}")))?;

        Ok((encoder_output, encoded_length.max(0) as usize))
    }

    fn greedy_decode(
        &mut self,
        encoder_output: &Array3<f32>,
        encoder_length: usize,
    ) -> Result<(Vec<usize>, Vec<usize>, Vec<usize>)> {
        let encoder_dimension = encoder_output.shape()[1];
        let time_steps = encoder_length.min(encoder_output.shape()[2]);
        let blank_id = self
            .vocabulary_size
            .checked_sub(1)
            .ok_or_else(|| Error::Model("Parakeet vocabulary cannot be empty".to_string()))?;
        let mut state_h = Array3::zeros((2, 1, 640));
        let mut state_c = Array3::zeros((2, 1, 640));
        let mut tokens = Vec::new();
        let mut frame_indices = Vec::new();
        let mut durations = Vec::new();
        let mut frame_index = 0;
        let mut emitted_at_frame = 0;
        let mut last_token = blank_id as i32;

        while frame_index < time_steps {
            let frame = encoder_output
                .slice(ndarray::s![0, .., frame_index])
                .to_owned()
                .to_shape((1, encoder_dimension, 1))
                .map_err(|error| {
                    Error::Model(format!("failed to reshape Parakeet encoder frame: {error}"))
                })?
                .to_owned();
            let targets = Array2::from_shape_vec((1, 1), vec![last_token])?;
            let outputs = self.decoder_joint.run(ort::inputs!(
                "encoder_outputs" => ort::value::Value::from_array(frame)?,
                "targets" => ort::value::Value::from_array(targets)?,
                "target_length" => ort::value::Value::from_array(Array1::from_vec(vec![1i32]))?,
                "input_states_1" => ort::value::Value::from_array(state_h.clone())?,
                "input_states_2" => ort::value::Value::from_array(state_c.clone())?
            ))?;
            let (_, logits) = outputs["outputs"]
                .try_extract_tensor::<f32>()
                .map_err(|error| {
                    Error::Model(format!(
                        "failed to extract Parakeet decoder logits: {error}"
                    ))
                })?;
            if logits.len() < self.vocabulary_size {
                return Err(Error::Model(format!(
                    "Parakeet decoder returned {} logits for a {}-token vocabulary",
                    logits.len(),
                    self.vocabulary_size
                )));
            }

            let token_id = argmax(&logits[..self.vocabulary_size]).unwrap_or(blank_id);
            let duration_step = argmax(&logits[self.vocabulary_size..]).unwrap_or_default();

            if token_id != blank_id {
                state_h = extract_state(&outputs, "output_states_1")?;
                state_c = extract_state(&outputs, "output_states_2")?;
                tokens.push(token_id);
                frame_indices.push(frame_index);
                durations.push(duration_step);
                last_token = token_id as i32;
                emitted_at_frame += 1;
            }

            if duration_step > 0 {
                frame_index += duration_step;
                emitted_at_frame = 0;
            } else if token_id == blank_id || emitted_at_frame >= 10 {
                frame_index += 1;
                emitted_at_frame = 0;
            }
        }

        Ok((tokens, frame_indices, durations))
    }
}

fn extract_state(outputs: &ort::session::SessionOutputs<'_>, name: &str) -> Result<Array3<f32>> {
    let (shape, data) = outputs[name].try_extract_tensor::<f32>().map_err(|error| {
        Error::Model(format!(
            "failed to extract Parakeet state `{name}`: {error}"
        ))
    })?;
    let dimensions = shape.as_ref();
    if dimensions.len() != 3 {
        return Err(Error::Model(format!(
            "expected a 3D Parakeet state `{name}`, got {dimensions:?}"
        )));
    }
    Array3::from_shape_vec(
        (
            dimensions[0] as usize,
            dimensions[1] as usize,
            dimensions[2] as usize,
        ),
        data.to_vec(),
    )
    .map_err(|error| Error::Model(format!("invalid Parakeet state `{name}`: {error}")))
}

fn argmax(values: &[f32]) -> Option<usize> {
    values
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(index, _)| index)
}

fn resolve_encoder(model_dir: &Path) -> Result<PathBuf> {
    resolve_model_file(
        model_dir,
        &[
            "encoder-model.int8.onnx",
            "encoder-model.onnx",
            "encoder.onnx",
        ],
        "Parakeet encoder",
    )
}

fn resolve_decoder_joint(model_dir: &Path) -> Result<PathBuf> {
    resolve_model_file(
        model_dir,
        &[
            "decoder_joint-model.int8.onnx",
            "decoder_joint-model.onnx",
            "decoder_joint.onnx",
            "decoder-model.onnx",
        ],
        "Parakeet decoder/joint",
    )
}

fn resolve_model_file(model_dir: &Path, candidates: &[&str], label: &str) -> Result<PathBuf> {
    candidates
        .iter()
        .map(|candidate| model_dir.join(candidate))
        .find(|path| path.is_file())
        .ok_or_else(|| {
            Error::Model(format!(
                "{label} model not found in {}",
                model_dir.display()
            ))
        })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn resolves_current_int8_artifact_names_first() {
        let directory = tempfile::tempdir().unwrap();
        let encoder = directory.path().join("encoder-model.int8.onnx");
        let decoder = directory.path().join("decoder_joint-model.int8.onnx");
        fs::write(&encoder, []).unwrap();
        fs::write(&decoder, []).unwrap();

        assert_eq!(resolve_encoder(directory.path()).unwrap(), encoder);
        assert_eq!(resolve_decoder_joint(directory.path()).unwrap(), decoder);
    }

    #[test]
    fn argmax_handles_empty_and_nan_values() {
        assert_eq!(argmax(&[]), None);
        assert_eq!(argmax(&[f32::NAN, 1.0, 2.0]), Some(2));
    }
}
