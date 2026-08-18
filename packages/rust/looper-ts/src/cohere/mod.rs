// Adapted from transcribe-rs 0.3.11 at revision
// 343768c100d566b135fbb7a2441e61fa8aa177f2.
// Copyright (c) 2025 Ilya Stupakov. Licensed under MIT; see THIRD_PARTY_NOTICES.md.

mod decoder;
mod vocab;

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use ndarray::{Array2, ArrayD, Ix3, IxDyn};
use ort::session::{Session, SessionInputValue};
use ort::value::DynValue;

use crate::{runtime, Error, ExecutionProvider, Result, Transcript};
use decoder::GreedyDecoder;

const DECODER_LAYERS: usize = 8;
const HEADS: usize = 8;
const HEAD_DIMENSION: usize = 128;
const MAX_SEQUENCE_LENGTH: usize = 1_024;
const MAX_NEW_TOKENS: usize = 512;
const SUPPORTED_LANGUAGES: &[&str] = &[
    "en", "de", "fr", "it", "es", "pt", "el", "nl", "pl", "ar", "vi", "zh", "ja", "ko",
];

pub(crate) struct Cohere {
    encoder: Session,
    decoder: Session,
    vocabulary: Vec<String>,
    token_to_id: HashMap<String, i64>,
    eos_id: i64,
    encoder_input_name: String,
    decoder_input_names: Vec<String>,
}

impl Cohere {
    pub fn load(
        model_dir: &Path,
        requested_provider: ExecutionProvider,
    ) -> Result<(Self, ExecutionProvider)> {
        if !model_dir.is_dir() {
            return Err(Error::Model(format!(
                "Cohere model directory does not exist: {}",
                model_dir.display()
            )));
        }

        let encoder_path = resolve_model_file(
            model_dir,
            &["cohere-encoder.int4.onnx", "encoder_model.int4.onnx"],
            "Cohere INT4 encoder",
        )?;
        let decoder_path = resolve_model_file(
            model_dir,
            &["cohere-decoder.int4.onnx", "decoder_model_merged.int4.onnx"],
            "Cohere INT4 decoder",
        )?;
        let vocabulary_path = resolve_model_file(
            model_dir,
            &["tokens.txt", "vocabulary.txt"],
            "Cohere vocabulary",
        )?;
        let vocabulary = vocab::load(&vocabulary_path)?;
        let token_to_id = vocabulary
            .iter()
            .enumerate()
            .filter(|(_, token)| !token.is_empty())
            .map(|(id, token)| (token.clone(), id as i64))
            .collect::<HashMap<_, _>>();
        let eos_id = token_to_id.get("<|endoftext|>").copied().unwrap_or(3);

        let (encoder, decoder, actual_provider) =
            load_sessions(&encoder_path, &decoder_path, requested_provider)?;
        let encoder_input_name = encoder
            .inputs()
            .first()
            .map(|input| input.name().to_string())
            .unwrap_or_else(|| "audio".to_string());
        let decoder_input_names = decoder
            .inputs()
            .iter()
            .map(|input| input.name().to_string())
            .collect();

        Ok((
            Self {
                encoder,
                decoder,
                vocabulary,
                token_to_id,
                eos_id,
                encoder_input_name,
                decoder_input_names,
            },
            actual_provider,
        ))
    }

    pub fn transcribe(
        &mut self,
        samples: &[f32],
        duration_ms: u128,
        language: Option<&str>,
    ) -> Result<Transcript> {
        let language = normalize_language(language)?;
        let prompt = self.build_prompt(language)?;
        let max_new_tokens = MAX_NEW_TOKENS.min(MAX_SEQUENCE_LENGTH.saturating_sub(prompt.len()));
        let text = self.transcribe_chunk(samples, &prompt, max_new_tokens)?;

        Ok(Transcript {
            text,
            duration_ms,
            segments: None,
            words: None,
        })
    }

    fn transcribe_chunk(
        &mut self,
        samples: &[f32],
        prompt: &[i64],
        max_new_tokens: usize,
    ) -> Result<String> {
        let audio = Array2::from_shape_vec((1, samples.len()), samples.to_vec())?.into_dyn();
        let (cross_k, cross_v) = {
            let mut outputs = self.encoder.run(vec![(
                Cow::Owned(self.encoder_input_name.clone()),
                ort::value::Value::from_array(audio)?.into_dyn(),
            )])?;
            (
                remove_output(&mut outputs, "n_layer_cross_k")?,
                remove_output(&mut outputs, "n_layer_cross_v")?,
            )
        };
        let token_name = self.decoder_input_name("tokens", &["input_ids"]);
        let self_k_name = self.decoder_input_name(
            "in_n_layer_self_k_cache",
            &["past_key_values", "past_key_values.key"],
        );
        let self_v_name =
            self.decoder_input_name("in_n_layer_self_v_cache", &["past_key_values.value"]);
        let cross_k_name = self.decoder_input_name("n_layer_cross_k", &["encoder_kv_cache.key"]);
        let cross_v_name = self.decoder_input_name("n_layer_cross_v", &["encoder_kv_cache.value"]);
        let offset_name = self.decoder_input_name("offset", &["cache_position"]);

        let mut greedy = GreedyDecoder::new(self.eos_id);
        let mut generated_ids = Vec::new();
        let mut current_tokens = prompt.to_vec();
        let mut offset = 0_i64;
        let mut self_k_cache = empty_cache()?;
        let mut self_v_cache = empty_cache()?;

        for _ in 0..max_new_tokens {
            let token_count = current_tokens.len();
            let tokens =
                Array2::from_shape_vec((1, token_count), current_tokens.clone())?.into_dyn();
            let inputs: Vec<(Cow<str>, SessionInputValue)> = vec![
                (
                    Cow::Borrowed(token_name.as_str()),
                    SessionInputValue::from(ort::value::Value::from_array(tokens)?),
                ),
                (
                    Cow::Borrowed(self_k_name.as_str()),
                    SessionInputValue::from(self_k_cache),
                ),
                (
                    Cow::Borrowed(self_v_name.as_str()),
                    SessionInputValue::from(self_v_cache),
                ),
                (
                    Cow::Borrowed(cross_k_name.as_str()),
                    SessionInputValue::from(&cross_k),
                ),
                (
                    Cow::Borrowed(cross_v_name.as_str()),
                    SessionInputValue::from(&cross_v),
                ),
                (
                    Cow::Borrowed(offset_name.as_str()),
                    SessionInputValue::from(ort::value::Value::from_array(
                        ndarray::arr0(offset).into_dyn(),
                    )?),
                ),
            ];
            let mut outputs = self.decoder.run(inputs)?;
            let last_logits = {
                let logits = outputs
                    .get("logits")
                    .ok_or_else(|| {
                        Error::Model("Cohere decoder did not return `logits`".to_string())
                    })?
                    .try_extract_array::<f32>()?
                    .into_dimensionality::<Ix3>()
                    .map_err(|error| {
                        Error::Model(format!("invalid Cohere decoder logits shape: {error}"))
                    })?;
                let last_position = logits.shape()[1].saturating_sub(1);
                logits.slice(ndarray::s![0, last_position, ..]).to_vec()
            };
            let Some(next_token) = greedy.next_token(&last_logits) else {
                break;
            };

            generated_ids.push(next_token);
            current_tokens = vec![next_token];
            offset += token_count as i64;
            self_k_cache = remove_output(&mut outputs, "out_n_layer_self_k_cache")?;
            self_v_cache = remove_output(&mut outputs, "out_n_layer_self_v_cache")?;
        }

        Ok(decode_ids(&self.vocabulary, &generated_ids))
    }

    fn build_prompt(&self, language: &str) -> Result<Vec<i64>> {
        [
            "<|startofcontext|>".to_string(),
            "<|startoftranscript|>".to_string(),
            "<|emo:undefined|>".to_string(),
            format!("<|{language}|>"),
            format!("<|{language}|>"),
            "<|pnc|>".to_string(),
            "<|noitn|>".to_string(),
            "<|notimestamp|>".to_string(),
            "<|nodiarize|>".to_string(),
        ]
        .iter()
        .map(|token| {
            self.token_to_id.get(token).copied().ok_or_else(|| {
                Error::Config(format!(
                    "Cohere vocabulary is missing prompt token `{token}`"
                ))
            })
        })
        .collect()
    }

    fn decoder_input_name(&self, preferred: &str, fallbacks: &[&str]) -> String {
        std::iter::once(preferred)
            .chain(fallbacks.iter().copied())
            .find(|candidate| {
                self.decoder_input_names
                    .iter()
                    .any(|name| name == candidate)
            })
            .unwrap_or(preferred)
            .to_string()
    }
}

fn load_sessions(
    encoder_path: &Path,
    decoder_path: &Path,
    requested_provider: ExecutionProvider,
) -> Result<(Session, Session, ExecutionProvider)> {
    let load_pair = |provider| {
        Ok::<_, Error>((
            runtime::create_session(encoder_path, provider)?,
            runtime::create_session(decoder_path, provider)?,
        ))
    };

    match requested_provider {
        ExecutionProvider::Cpu => {
            let (encoder, decoder) = load_pair(ExecutionProvider::Cpu)?;
            Ok((encoder, decoder, ExecutionProvider::Cpu))
        }
        ExecutionProvider::DirectMl => match load_pair(ExecutionProvider::DirectMl) {
            Ok((encoder, decoder)) => Ok((encoder, decoder, ExecutionProvider::DirectMl)),
            Err(_) => {
                let (encoder, decoder) = load_pair(ExecutionProvider::Cpu)?;
                Ok((encoder, decoder, ExecutionProvider::Cpu))
            }
        },
    }
}

fn resolve_model_file(model_dir: &Path, candidates: &[&str], label: &str) -> Result<PathBuf> {
    [model_dir.to_path_buf(), model_dir.join("onnx")]
        .iter()
        .flat_map(|base| candidates.iter().map(move |candidate| base.join(candidate)))
        .find(|path| path.is_file())
        .ok_or_else(|| Error::Model(format!("{label} not found in {}", model_dir.display())))
}

fn normalize_language(language: Option<&str>) -> Result<&str> {
    let language = language.unwrap_or_default().trim();
    if language.is_empty() || language.eq_ignore_ascii_case("auto") {
        return Err(Error::Validation(
            "Cohere requires an explicit transcription language".to_string(),
        ));
    }
    let normalized = match language {
        "zh-Hans" | "zh-Hant" => "zh",
        other => other,
    };
    SUPPORTED_LANGUAGES
        .contains(&normalized)
        .then_some(normalized)
        .ok_or_else(|| Error::Validation(format!("Cohere does not support language `{language}`")))
}

fn empty_cache() -> Result<DynValue> {
    Ok(ort::value::Value::from_array(ArrayD::<f32>::zeros(IxDyn(&[
        DECODER_LAYERS,
        1,
        HEADS,
        MAX_SEQUENCE_LENGTH,
        HEAD_DIMENSION,
    ])))?
    .into_dyn())
}

fn remove_output(outputs: &mut ort::session::SessionOutputs, name: &str) -> Result<DynValue> {
    outputs.remove(name).ok_or_else(|| {
        Error::Model(format!(
            "Cohere model did not return expected output `{name}`"
        ))
    })
}

fn decode_ids(vocabulary: &[String], token_ids: &[i64]) -> String {
    let mut bytes = Vec::new();
    for token in token_ids
        .iter()
        .filter_map(|id| vocabulary.get(*id as usize))
        .filter(|token| {
            !token.trim().is_empty()
                && !token.starts_with("<|")
                && token.as_str() != "<unk>"
                && token.as_str() != "<pad>"
        })
    {
        if let Some(byte) = vocab::parse_byte_token(token) {
            bytes.push(byte);
        } else {
            bytes.extend_from_slice(token.as_bytes());
        }
    }

    String::from_utf8_lossy(&bytes).trim().replace(" '", "'")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn resolves_current_int4_artifacts() {
        let directory = tempfile::tempdir().unwrap();
        let encoder = directory.path().join("cohere-encoder.int4.onnx");
        let decoder = directory.path().join("cohere-decoder.int4.onnx");
        let tokens = directory.path().join("tokens.txt");
        fs::write(&encoder, []).unwrap();
        fs::write(&decoder, []).unwrap();
        fs::write(&tokens, []).unwrap();

        assert_eq!(
            resolve_model_file(directory.path(), &["cohere-encoder.int4.onnx"], "encoder").unwrap(),
            encoder
        );
        assert_eq!(
            resolve_model_file(directory.path(), &["cohere-decoder.int4.onnx"], "decoder").unwrap(),
            decoder
        );
    }

    #[test]
    fn validates_and_normalizes_explicit_languages() {
        assert!(normalize_language(None).is_err());
        assert!(normalize_language(Some("auto")).is_err());
        assert_eq!(normalize_language(Some("es")).unwrap(), "es");
        assert_eq!(normalize_language(Some("zh-Hans")).unwrap(), "zh");
        assert!(normalize_language(Some("sv")).is_err());
    }

    #[test]
    fn decodes_byte_tokens_and_contractions() {
        let vocabulary = vec![
            "<0xE4>".to_string(),
            "<0xBD>".to_string(),
            "<0xA0>".to_string(),
            " can".to_string(),
            " 't".to_string(),
        ];

        assert_eq!(decode_ids(&vocabulary, &[0, 1, 2]), "你");
        assert_eq!(decode_ids(&vocabulary, &[3, 4]), "can't");
    }
}
