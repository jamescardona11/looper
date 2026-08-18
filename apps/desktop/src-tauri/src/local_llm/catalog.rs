use serde::Serialize;

pub const DEFAULT_MODEL_ID: &str = "qwen3.5:4b-q3_k_m";
pub const MODEL_FILE_NAME: &str = "Qwen3.5-4B-Q3_K_M.gguf";
pub const MODEL_SIZE_BYTES: u64 = 2_293_388_448;
pub const MODEL_SHA256: &str = "d6981ab4d77ba712b48ef69d69042d75b5e39b9dce5fb5a5b054fd08e06afb95";
pub const MODEL_URL: &str = "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q3_K_M.gguf";
pub const CONTEXT_TOKENS: u32 = 16_384;
pub const MODEL_DIRECTORY: &str = "qwen3.5-4b-q3_k_m";
pub const RETIRED_MODEL_DIRECTORIES: &[&str] = &["qwen3.5-2b-q4_k_m"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModelInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub file_name: &'static str,
    pub size_bytes: u64,
    pub context_tokens: u32,
    pub license: &'static str,
    pub attribution_url: &'static str,
}

pub fn model_info() -> LocalLlmModelInfo {
    LocalLlmModelInfo {
        id: DEFAULT_MODEL_ID,
        label: "Looper Local AI · Qwen 3.5 4B",
        file_name: MODEL_FILE_NAME,
        size_bytes: MODEL_SIZE_BYTES,
        context_tokens: CONTEXT_TOKENS,
        license: "Apache-2.0",
        attribution_url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF",
    }
}

pub fn is_known_model(model: &str) -> bool {
    model == DEFAULT_MODEL_ID
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qwen_artifact_is_pinned_and_verifiable() {
        let model = model_info();
        assert_eq!(model.id, DEFAULT_MODEL_ID);
        assert_eq!(model.size_bytes, 2_293_388_448);
        assert!(MODEL_URL.contains("/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/"));
        assert_eq!(
            MODEL_SHA256,
            "d6981ab4d77ba712b48ef69d69042d75b5e39b9dce5fb5a5b054fd08e06afb95"
        );
        assert_eq!(MODEL_SHA256.len(), 64);
        assert_eq!(model.license, "Apache-2.0");
    }

    #[test]
    fn retired_models_are_not_available() {
        assert!(!is_known_model("qwen3.5:2b-q4_k_m"));
        assert!(is_known_model(DEFAULT_MODEL_ID));
    }
}
