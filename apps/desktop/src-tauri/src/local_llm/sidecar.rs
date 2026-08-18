use std::io::{self, BufRead, Write};
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

use super::catalog::CONTEXT_TOKENS;
use super::protocol::{format_qwen_prompt, sanitize_output, SidecarRequest, SidecarResponse};

const BATCH_TOKENS: usize = 512;

struct ModelState {
    backend: LlamaBackend,
    model: Option<LlamaModel>,
    model_path: Option<PathBuf>,
}

impl ModelState {
    fn new() -> Result<Self> {
        Ok(Self {
            backend: LlamaBackend::init().context("initialize llama.cpp")?,
            model: None,
            model_path: None,
        })
    }

    fn ensure_model(&mut self, path: &Path) -> Result<()> {
        if self.model_path.as_deref() != Some(path) {
            let gpu_params = LlamaModelParams::default()
                .with_n_gpu_layers(u32::MAX)
                .with_use_mmap(self.backend.supports_mmap());
            let loaded =
                LlamaModel::load_from_file(&self.backend, path, &gpu_params).or_else(|gpu_error| {
                    eprintln!("local LLM GPU load unavailable; retrying on CPU: {gpu_error}");
                    let cpu_params = LlamaModelParams::default()
                        .with_n_gpu_layers(0)
                        .with_use_mmap(self.backend.supports_mmap());
                    LlamaModel::load_from_file(&self.backend, path, &cpu_params)
                });
            self.model =
                Some(loaded.with_context(|| format!("load local LLM model {}", path.display()))?);
            self.model_path = Some(path.to_path_buf());
        }
        self.model
            .as_ref()
            .map(|_| ())
            .ok_or_else(|| anyhow!("local LLM model is not loaded"))
    }

    fn generate(
        &mut self,
        model_path: &Path,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String> {
        self.ensure_model(model_path)?;
        let backend = &self.backend;
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| anyhow!("local LLM model is not loaded"))?;
        let threads = std::thread::available_parallelism()
            .map(|value| (value.get() / 2).clamp(2, 8) as i32)
            .unwrap_or(2);
        let context = NonZeroU32::new(CONTEXT_TOKENS).expect("context is non-zero");
        let params = LlamaContextParams::default()
            .with_n_ctx(Some(context))
            .with_n_batch(BATCH_TOKENS as u32)
            .with_n_threads(threads)
            .with_n_threads_batch(threads);
        let mut ctx = model
            .new_context(backend, params)
            .context("create local LLM context")?;
        let prompt = format_qwen_prompt(system_prompt, user_prompt);
        let prompt_tokens = model
            .str_to_token(&prompt, AddBos::Always)
            .context("tokenize local LLM prompt")?;
        let required = prompt_tokens.len().saturating_add(max_tokens as usize);
        if required >= CONTEXT_TOKENS as usize {
            return Err(anyhow!(
                "local LLM prompt is too long ({required} tokens for a {CONTEXT_TOKENS}-token context)"
            ));
        }

        let mut batch = LlamaBatch::new(BATCH_TOKENS, 1);
        for (chunk_index, chunk) in prompt_tokens.chunks(BATCH_TOKENS).enumerate() {
            batch.clear();
            let offset = chunk_index * BATCH_TOKENS;
            for (index, token) in chunk.iter().enumerate() {
                let absolute = offset + index;
                batch.add(
                    *token,
                    absolute as i32,
                    &[0],
                    absolute + 1 == prompt_tokens.len(),
                )?;
            }
            ctx.decode(&mut batch).context("decode local LLM prompt")?;
        }

        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u32;
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::penalties(256, 1.05, 0.0, 0.3),
            LlamaSampler::top_k(20),
            LlamaSampler::top_p(0.8, 1),
            LlamaSampler::temp(0.5),
            LlamaSampler::dist(seed),
        ]);
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut output = String::new();
        let mut position = prompt_tokens.len() as i32;

        for _ in 0..max_tokens {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);
            if model.is_eog_token(token) {
                break;
            }
            output.push_str(
                &model
                    .token_to_piece(token, &mut decoder, true, None)
                    .context("decode local LLM token")?,
            );
            if output.contains("<|im_end|>") {
                break;
            }
            batch.clear();
            batch.add(token, position, &[0], true)?;
            ctx.decode(&mut batch)
                .context("decode generated local LLM token")?;
            position += 1;
        }

        Ok(sanitize_output(&output))
    }
}

fn write_response(response: &SidecarResponse) -> Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, response)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

pub fn run() -> Result<()> {
    let mut state = ModelState::new()?;
    for line in io::stdin().lock().lines() {
        let line = line?;
        let request = match serde_json::from_str::<SidecarRequest>(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(&SidecarResponse::Error {
                    request_id: None,
                    message: format!("invalid sidecar request: {error}"),
                })?;
                continue;
            }
        };

        match request {
            SidecarRequest::Generate {
                request_id,
                model_path,
                system_prompt,
                user_prompt,
                max_tokens,
            } => {
                let result = state.generate(
                    Path::new(&model_path),
                    &system_prompt,
                    &user_prompt,
                    max_tokens,
                );
                let response = match result {
                    Ok(text) => SidecarResponse::Generated { request_id, text },
                    Err(error) => SidecarResponse::Error {
                        request_id: Some(request_id),
                        message: error.to_string(),
                    },
                };
                write_response(&response)?;
            }
            SidecarRequest::Shutdown => {
                write_response(&SidecarResponse::Goodbye)?;
                break;
            }
        }
    }
    Ok(())
}
