use anyhow::{anyhow, Result};
use looper_ts::{ModelCapabilities, ModelKind, ModelSpec, RemoteFile};
use serde::Serialize;
use tauri::AppHandle;

use crate::model_language_table::{
    cohere_supported_languages, parakeet_v3_supported_languages, SupportedLanguageInfo,
};
use crate::settings::UserSettings;
use crate::speech::{install, remote};
use crate::AppRuntime;

pub const MODEL_CAPABILITY_DICTIONARY: &str = "dictionary";
pub const MODEL_CAPABILITY_TIMESTAMPS: &str = "timestamps";
pub const MODEL_CAPABILITY_STREAMING: &str = "streaming";
pub const MODEL_CAPABILITY_DIARIZATION: &str = "diarization";

const MODEL_MIRROR_ENV: &str = "LOOPER_MODEL_MIRROR_BASE_URL";
const UNCONFIGURED_MIRROR_SCHEME: &str = "looper-model-mirror-unconfigured://";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalModelEngine {
    Parakeet,
    Cohere,
}

impl LocalModelEngine {
    pub fn model_kind(self) -> ModelKind {
        match self {
            Self::Parakeet => ModelKind::ParakeetTdtInt8,
            Self::Cohere => ModelKind::CohereInt4,
        }
    }

    pub fn capabilities(self) -> ModelCapabilities {
        self.model_kind().capabilities()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelAvailability {
    Public,
    Experimental,
    Archived,
    Retired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LanguageSelectionMode {
    /// The model determines the language from the audio and does not consume
    /// the user's language setting during recognition.
    AutoDetect,
    /// The model requires the user to choose the spoken language.
    UserSelect,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelInfo {
    pub key: String,
    pub label: String,
    pub description: String,
    pub size_mb: f32,
    pub engine_id: String,
    pub family: String,
    pub variant: String,
    pub category: String,
    pub downloadable: bool,
    pub tags: Vec<String>,
    pub capabilities: Vec<String>,
    pub supported_languages: Vec<SupportedLanguageInfo>,
    pub language_selection_mode: LanguageSelectionMode,
    pub ane_size_mb: Option<f32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SpeechModel {
    pub id: String,
    pub key: String,
    pub label: String,
    pub description: String,
    pub size_mb: f32,
    pub engine_id: String,
    pub variant: String,
    pub tags: Vec<String>,
    pub capabilities: Vec<String>,
    pub supported_languages: Vec<SupportedLanguageInfo>,
    pub remote: bool,
    pub installed: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct InactiveModelInfo {
    pub id: String,
    pub label: String,
    pub family: String,
    pub variant: String,
    pub engine_id: String,
    pub availability: ModelAvailability,
    pub size_mb: f32,
    pub artifacts: Vec<InactiveArtifactInfo>,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct InactiveArtifactInfo {
    pub path: String,
    pub size_bytes: u64,
    pub sha256: String,
}

struct CatalogFile {
    mirror_path: &'static str,
    path: &'static str,
    size_bytes: u64,
    sha256: &'static str,
}

struct InactiveCatalogFile {
    path: &'static str,
    size_bytes: u64,
    sha256: &'static str,
}

pub struct LocalModelManifest {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub category: &'static str,
    pub tags: &'static [&'static str],
    pub engine: LocalModelEngine,
    pub family: &'static str,
    pub variant: &'static str,
    files: &'static [CatalogFile],
}

pub struct InactiveModelManifest {
    pub id: &'static str,
    pub label: &'static str,
    pub family: &'static str,
    pub variant: &'static str,
    pub engine_id: &'static str,
    pub availability: ModelAvailability,
    files: &'static [InactiveCatalogFile],
    pub capabilities: &'static [&'static str],
}

const PARAKEET_TDT_INT8_FILES: &[CatalogFile] = &[
    CatalogFile {
        mirror_path: "speech/parakeet-tdt-0.6b-v3-onnx/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/encoder-model.int8.onnx",
        path: "encoder-model.int8.onnx",
        size_bytes: 652_183_999,
        sha256: "6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09",
    },
    CatalogFile {
        mirror_path: "speech/parakeet-tdt-0.6b-v3-onnx/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/decoder_joint-model.int8.onnx",
        path: "decoder_joint-model.int8.onnx",
        size_bytes: 18_202_004,
        sha256: "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70",
    },
    CatalogFile {
        mirror_path: "speech/parakeet-tdt-0.6b-v3-onnx/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/vocab.txt",
        path: "vocab.txt",
        size_bytes: 93_939,
        sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
    },
];

const COHERE_TRANSCRIBE_INT4_FILES: &[CatalogFile] = &[
    CatalogFile {
        mirror_path: "speech/cohere-transcribe-onnx-int4/2f3f5e5aebd2a57312c4a24fdb375645029f88c2/cohere-encoder.int4.onnx",
        path: "cohere-encoder.int4.onnx",
        size_bytes: 6_153_388,
        sha256: "1bd619df7113a27d75b136ddc9f35d6b65131baeec15a7680ddda0c18c0b20a5",
    },
    CatalogFile {
        mirror_path: "speech/cohere-transcribe-onnx-int4/2f3f5e5aebd2a57312c4a24fdb375645029f88c2/cohere-encoder.int4.onnx.data",
        path: "cohere-encoder.int4.onnx.data",
        size_bytes: 1_844_879_360,
        sha256: "f5bffddbf657edff4b14e650926cdb39b62a8644feb9f6ee4e3287df38e7f900",
    },
    CatalogFile {
        mirror_path: "speech/cohere-transcribe-onnx-int4/2f3f5e5aebd2a57312c4a24fdb375645029f88c2/cohere-decoder.int4.onnx",
        path: "cohere-decoder.int4.onnx",
        size_bytes: 371_849,
        sha256: "f176a71e8b743d32bb8e4b8ec19bf70f367c5c3c93b08857826d8f5b60b6ad1e",
    },
    CatalogFile {
        mirror_path: "speech/cohere-transcribe-onnx-int4/2f3f5e5aebd2a57312c4a24fdb375645029f88c2/cohere-decoder.int4.onnx.data",
        path: "cohere-decoder.int4.onnx.data",
        size_bytes: 143_245_312,
        sha256: "ed9461dd2233c44cd86f56c0a4d17c089de317bdbdcf18dc92e44a8a0cf525b3",
    },
    CatalogFile {
        mirror_path: "speech/cohere-transcribe-onnx-int4/2f3f5e5aebd2a57312c4a24fdb375645029f88c2/tokens.txt",
        path: "tokens.txt",
        size_bytes: 207_437,
        sha256: "013ede043ae2480e3a9205cc34550d9686100cc682bacc90f702facdfbb93035",
    },
];

const PARAKEET_UNIFIED_INT8_FILES: &[InactiveCatalogFile] = &[
    InactiveCatalogFile {
        path: "encoder.int8.onnx",
        size_bytes: 42_606_669,
        sha256: "c81adfab77634e00c1668a221a14f244c5fb3409e7c14eeebaf6ac963425910f",
    },
    InactiveCatalogFile {
        path: "encoder.int8.onnx.data",
        size_bytes: 611_491_584,
        sha256: "3d54dd04646c15677bd2844a84df3770b12cc1ce183481f7b6e0def31c92114a",
    },
    InactiveCatalogFile {
        path: "decoder_joint.int8.onnx",
        size_bytes: 8_995_064,
        sha256: "7f76ad5f35035f25630075699c6c942a2c0c05ff42cb398f966f3c256d148e1e",
    },
    InactiveCatalogFile {
        path: "tokenizer.model",
        size_bytes: 251_056,
        sha256: "07d4e5a63840a53ab2d4d106d2874768143fb3fbdd47938b3910d2da05bfb0a9",
    },
];

const NEMOTRON_35_STREAMING_FILES: &[InactiveCatalogFile] = &[
    InactiveCatalogFile {
        path: "encoder.onnx",
        size_bytes: 42_164_972,
        sha256: "d569fbe78b48fbb04e169d324f5d25463838ceed7b5fc3bfe209872441979bd9",
    },
    InactiveCatalogFile {
        path: "encoder.onnx.data",
        size_bytes: 2_454_405_120,
        sha256: "7584f85df76bc9ae6fbdfa53aa8d97b07a842525d1c501d536d77fd9e4f57ac7",
    },
    InactiveCatalogFile {
        path: "decoder_joint.onnx",
        size_bytes: 97_590_054,
        sha256: "634dfadf24cb4f73c2fae170b36611d68db48186426882cbc8f7e02ed9f2bb29",
    },
    InactiveCatalogFile {
        path: "tokenizer.model",
        size_bytes: 406_554,
        sha256: "ce3895e40806f02a26c3a225161b96ef682d6c0054bae32a245dec4258d7d291",
    },
];

const WHISPER_LARGE_V3_TURBO_Q5_FILES: &[InactiveCatalogFile] = &[InactiveCatalogFile {
    path: "ggml-large-v3-turbo-q5_0.bin",
    size_bytes: 574_041_195,
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
}];

const WHISPER_SMALL_Q5_FILES: &[InactiveCatalogFile] = &[InactiveCatalogFile {
    path: "ggml-small-q5_1.bin",
    size_bytes: 190_085_487,
    sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
}];

const WHISPER_LARGE_V3_TURBO_Q8_FILES: &[InactiveCatalogFile] = &[InactiveCatalogFile {
    path: "ggml-large-v3-turbo-q8_0.bin",
    size_bytes: 874_188_075,
    sha256: "317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1",
}];

const DISTIL_WHISPER_LARGE_V35_FILES: &[InactiveCatalogFile] = &[InactiveCatalogFile {
    path: "ggml-distil-large-v3.5-q8_0.bin",
    size_bytes: 818_305_955,
    sha256: "7e570abdf13b681354a2ecc93802e25bf204dd6f8c0dd9f6ecb9478b71b231d7",
}];

const MODEL_MANIFESTS: &[LocalModelManifest] = &[
    LocalModelManifest {
        id: "parakeet_tdt_int8",
        family: "parakeet-tdt",
        label: "Parakeet TDT V3",
        description:
            "Fast, multilingual and accurate. Based on ONNX for everyday local transcription.",
        tags: &["Multilingual", "Fast"],
        category: "standard",
        engine: LocalModelEngine::Parakeet,
        variant: "Int8",
        files: PARAKEET_TDT_INT8_FILES,
    },
    LocalModelManifest {
        id: "cohere_transcribe_int4",
        family: "cohere-transcribe",
        label: "Cohere Transcribe",
        description: "High-accuracy multilingual transcription optimized for local dictation.",
        tags: &["Multilingual", "High accuracy"],
        category: "standard",
        engine: LocalModelEngine::Cohere,
        variant: "Int4",
        files: COHERE_TRANSCRIBE_INT4_FILES,
    },
];

const INACTIVE_MODEL_MANIFESTS: &[InactiveModelManifest] = &[
    InactiveModelManifest {
        id: "parakeet_unified_en_int8",
        label: "Parakeet Unified",
        family: "parakeet-unified",
        variant: "Int8",
        engine_id: "parakeet-unified",
        availability: ModelAvailability::Experimental,
        files: PARAKEET_UNIFIED_INT8_FILES,
        capabilities: &[MODEL_CAPABILITY_TIMESTAMPS, MODEL_CAPABILITY_STREAMING],
    },
    InactiveModelManifest {
        id: "nemotron_35_streaming_multilingual",
        label: "Nemotron 3.5 Streaming",
        family: "nemotron-35-streaming",
        variant: "Full",
        engine_id: "nemotron",
        availability: ModelAvailability::Experimental,
        files: NEMOTRON_35_STREAMING_FILES,
        capabilities: &[MODEL_CAPABILITY_STREAMING],
    },
    InactiveModelManifest {
        id: "whisper_large_v3_turbo_q5",
        label: "Whisper Large V3 Turbo",
        family: "whisper-large-v3-turbo",
        variant: "Q5_0",
        engine_id: "whisper",
        availability: ModelAvailability::Experimental,
        files: WHISPER_LARGE_V3_TURBO_Q5_FILES,
        capabilities: &[MODEL_CAPABILITY_DICTIONARY, MODEL_CAPABILITY_TIMESTAMPS],
    },
    InactiveModelManifest {
        id: "whisper_small_q5",
        label: "Whisper Small",
        family: "whisper-small",
        variant: "Q5_1",
        engine_id: "whisper",
        availability: ModelAvailability::Experimental,
        files: WHISPER_SMALL_Q5_FILES,
        capabilities: &[MODEL_CAPABILITY_DICTIONARY, MODEL_CAPABILITY_TIMESTAMPS],
    },
    InactiveModelManifest {
        id: "whisper_large_v3_turbo_q8",
        label: "Whisper Large V3 Turbo",
        family: "whisper-large-v3-turbo",
        variant: "Q8_0",
        engine_id: "whisper",
        availability: ModelAvailability::Archived,
        files: WHISPER_LARGE_V3_TURBO_Q8_FILES,
        capabilities: &[MODEL_CAPABILITY_DICTIONARY, MODEL_CAPABILITY_TIMESTAMPS],
    },
    InactiveModelManifest {
        id: "distil_whisper_large_v35",
        label: "Distil-Whisper Large V3.5",
        family: "distil-large",
        variant: "Q8_0",
        engine_id: "whisper",
        availability: ModelAvailability::Archived,
        files: DISTIL_WHISPER_LARGE_V35_FILES,
        capabilities: &[MODEL_CAPABILITY_DICTIONARY, MODEL_CAPABILITY_TIMESTAMPS],
    },
];

/// Model IDs intentionally removed from the runtime catalog. Their cache
/// directories are never deleted automatically.
pub const RETIRED_MODEL_IDS: &[&str] = &[
    "whisper_large_v3_turbo",
    "whisper_large_v3_q5",
    "whisper_large_v3",
    "whisper_medium_q5",
    "whisper_medium_q8",
    "whisper_medium",
    "whisper_small_q8",
    "whisper_small",
    "whisper_base_q5",
    "whisper_base_q8",
    "whisper_base",
    "whisper_tiny_q5",
    "whisper_tiny_q8",
    "whisper_tiny",
    "distil_whisper_medium_en",
    "distil_whisper_small_en",
    "nemotron_streaming_en",
];

#[derive(Clone, Copy)]
struct CatalogRegistry;

const CATALOG: CatalogRegistry = CatalogRegistry;

impl CatalogRegistry {
    fn visible_on_this_platform(manifest: &LocalModelManifest) -> bool {
        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        {
            manifest.engine == LocalModelEngine::Cohere
        }
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        {
            let _ = manifest;
            true
        }
    }

    fn active(self) -> impl Iterator<Item = &'static LocalModelManifest> {
        MODEL_MANIFESTS
            .iter()
            .filter(|manifest| Self::visible_on_this_platform(manifest))
    }

    fn active_named(self, key: &str) -> Option<&'static LocalModelManifest> {
        self.active().find(|entry| entry.id == key)
    }

    fn inactive(self) -> impl Iterator<Item = &'static InactiveModelManifest> {
        INACTIVE_MODEL_MANIFESTS.iter()
    }

    fn inactive_named(self, key: &str) -> Option<&'static InactiveModelManifest> {
        self.inactive().find(|entry| entry.id == key)
    }

    fn availability(self, key: &str) -> Option<ModelAvailability> {
        self.active_named(key)
            .map(|_| ModelAvailability::Public)
            .or_else(|| inactive_definition(key).map(|entry| entry.availability))
            .or_else(|| {
                RETIRED_MODEL_IDS
                    .contains(&key)
                    .then_some(ModelAvailability::Retired)
            })
    }
}

impl CatalogFile {
    fn remote_file(&self) -> RemoteFile {
        RemoteFile {
            url: ModelMirror::artifact_url(self.mirror_path),
            path: self.path.to_owned(),
            size_bytes: Some(self.size_bytes),
            sha256: Some(self.sha256.to_owned()),
        }
    }
}

impl InactiveCatalogFile {
    fn public_metadata(&self) -> InactiveArtifactInfo {
        InactiveArtifactInfo {
            path: self.path.to_owned(),
            size_bytes: self.size_bytes,
            sha256: self.sha256.to_owned(),
        }
    }
}

impl LocalModelEngine {
    fn provider_id(self) -> &'static str {
        match self {
            Self::Parakeet => "nvidia",
            Self::Cohere => "cohere",
        }
    }

    fn languages(self) -> Vec<SupportedLanguageInfo> {
        match self {
            Self::Parakeet => parakeet_v3_supported_languages(),
            Self::Cohere => cohere_supported_languages(),
        }
    }

    fn language_selection(self) -> LanguageSelectionMode {
        if self.capabilities().requires_language {
            LanguageSelectionMode::UserSelect
        } else {
            LanguageSelectionMode::AutoDetect
        }
    }
}

impl LocalModelManifest {
    fn bytes(&self) -> u64 {
        self.files.iter().map(|artifact| artifact.size_bytes).sum()
    }

    fn published_capabilities(&self) -> Vec<String> {
        if self.engine.capabilities().timestamps {
            vec![MODEL_CAPABILITY_TIMESTAMPS.to_owned()]
        } else {
            Vec::new()
        }
    }

    fn supports(&self, capability: &str) -> bool {
        capability == MODEL_CAPABILITY_TIMESTAMPS && self.engine.capabilities().timestamps
    }

    fn installation(&self) -> ModelSpec {
        ModelSpec {
            id: self.id.to_owned(),
            files: self.files.iter().map(CatalogFile::remote_file).collect(),
        }
    }

    fn public_info(&self) -> ModelInfo {
        ModelInfo {
            key: self.id.to_owned(),
            label: self.label.to_owned(),
            description: self.description.to_owned(),
            size_mb: self.bytes() as f32 / 1_000_000.0,
            engine_id: self.engine.provider_id().to_owned(),
            family: self.family.to_owned(),
            variant: self.variant.to_owned(),
            category: self.category.to_owned(),
            downloadable: true,
            tags: self.tags.iter().map(|tag| (*tag).to_owned()).collect(),
            capabilities: self.published_capabilities(),
            supported_languages: self.engine.languages(),
            language_selection_mode: self.engine.language_selection(),
            ane_size_mb: None,
        }
    }
}

impl InactiveModelManifest {
    fn public_info(&self) -> InactiveModelInfo {
        let bytes = self
            .files
            .iter()
            .map(|artifact| artifact.size_bytes)
            .sum::<u64>();
        InactiveModelInfo {
            id: self.id.to_owned(),
            label: self.label.to_owned(),
            family: self.family.to_owned(),
            variant: self.variant.to_owned(),
            engine_id: self.engine_id.to_owned(),
            availability: self.availability,
            size_mb: bytes as f32 / 1_000_000.0,
            artifacts: self
                .files
                .iter()
                .map(InactiveCatalogFile::public_metadata)
                .collect(),
            capabilities: self
                .capabilities
                .iter()
                .map(|capability| (*capability).to_owned())
                .collect(),
        }
    }
}

struct ModelMirror;

impl ModelMirror {
    fn configured_base() -> Option<String> {
        std::env::var(MODEL_MIRROR_ENV)
            .ok()
            .or_else(|| option_env!("LOOPER_MODEL_MIRROR_BASE_URL").map(str::to_owned))
            .map(|candidate| candidate.trim().trim_end_matches('/').to_owned())
            .filter(|candidate| !candidate.is_empty())
    }

    fn artifact_url(path: &str) -> String {
        match Self::configured_base() {
            Some(base) => format!("{base}/{path}"),
            None => format!("{UNCONFIGURED_MIRROR_SCHEME}{path}"),
        }
    }

    fn require_configuration() -> Result<()> {
        if Self::configured_base().is_some() {
            return Ok(());
        }
        Err(anyhow!(
            "{MODEL_MIRROR_ENV} is not configured, so no speech model can be installed. Looper does not fall back to third-party model hosts. Set it in apps/desktop/.env and rebuild, or pass it for a single command: {MODEL_MIRROR_ENV}=<base-url> looper models install <model-id>"
        ))
    }
}

impl SpeechModel {
    fn local(info: ModelInfo, installed: bool) -> Self {
        Self {
            id: info.key.clone(),
            key: info.key,
            label: info.label,
            description: info.description,
            size_mb: info.size_mb,
            engine_id: info.engine_id,
            variant: info.variant,
            tags: info.tags,
            capabilities: info.capabilities,
            supported_languages: info.supported_languages,
            remote: false,
            installed,
        }
    }

    fn remote(settings: &UserSettings) -> Self {
        let id = remote::speech_model_storage_label(settings, None);
        Self {
            label: label(&id),
            key: id.clone(),
            id,
            description: "Transcribes through your configured remote speech provider.".to_owned(),
            size_mb: 0.0,
            engine_id: "remote".to_owned(),
            variant: String::new(),
            tags: vec!["Remote".to_owned()],
            capabilities: remote_capabilities(settings),
            supported_languages: Vec::new(),
            remote: true,
            installed: true,
        }
    }
}

fn remote_capabilities(settings: &UserSettings) -> Vec<String> {
    let mut capabilities = vec![
        MODEL_CAPABILITY_TIMESTAMPS.to_owned(),
        MODEL_CAPABILITY_DICTIONARY.to_owned(),
    ];
    if crate::remote_api::supports_diarization(&remote::resolved_endpoint(settings)) {
        capabilities.push(MODEL_CAPABILITY_DIARIZATION.to_owned());
    }
    capabilities
}

fn compose_models(
    settings: &UserSettings,
    mut installed: impl FnMut(&str) -> bool,
) -> Vec<SpeechModel> {
    let remote_model = remote::is_configured(settings).then(|| SpeechModel::remote(settings));
    remote_model
        .into_iter()
        .chain(list_local_models().into_iter().map(|info| {
            let ready = installed(&info.key);
            SpeechModel::local(info, ready)
        }))
        .collect()
}

struct RemoteModelLabel<'a> {
    provider: &'a str,
    model: Option<&'a str>,
}

impl<'a> RemoteModelLabel<'a> {
    fn parse(token: &'a str) -> Self {
        let without_prefix = token
            .trim()
            .strip_prefix(remote::SPEECH_MODEL_REMOTE_PREFIX)
            .unwrap_or(token);
        let mut components = without_prefix.splitn(2, ':');
        Self {
            provider: components.next().unwrap_or_default(),
            model: components.next().filter(|value| !value.is_empty()),
        }
    }

    fn render(self) -> String {
        let provider = provider_name(self.provider);
        self.model
            .map(|model| format!("{provider} · {model}"))
            .unwrap_or(provider)
    }
}

fn provider_name(provider: &str) -> String {
    match provider.trim().to_ascii_lowercase().as_str() {
        "openai" => "OpenAI".to_owned(),
        "groq" => "Groq".to_owned(),
        "mistral" => "Mistral".to_owned(),
        "fireworks" => "Fireworks".to_owned(),
        "openrouter" => "OpenRouter".to_owned(),
        "deepgram" => "Deepgram".to_owned(),
        "elevenlabs" => "ElevenLabs".to_owned(),
        "custom" => "Custom".to_owned(),
        "" => "Remote".to_owned(),
        other => other.to_owned(),
    }
}

pub fn local_manifests() -> impl Iterator<Item = &'static LocalModelManifest> {
    CATALOG.active()
}

pub fn definition(key: &str) -> Option<&'static LocalModelManifest> {
    CATALOG.active_named(key)
}

pub fn inactive_manifests() -> impl Iterator<Item = &'static InactiveModelManifest> {
    CATALOG.inactive()
}

pub fn inactive_definition(key: &str) -> Option<&'static InactiveModelManifest> {
    CATALOG.inactive_named(key)
}

pub fn list_inactive_models() -> Vec<InactiveModelInfo> {
    inactive_manifests()
        .map(InactiveModelManifest::public_info)
        .collect()
}

pub fn model_availability(key: &str) -> Option<ModelAvailability> {
    CATALOG.availability(key)
}

pub fn known_model_id(key: &str) -> bool {
    model_availability(key).is_some()
}

pub fn model_is_downloadable(key: &str) -> bool {
    model_availability(key) == Some(ModelAvailability::Public)
}

pub fn ensure_model_mirror_configured() -> Result<()> {
    ModelMirror::require_configuration()
}

pub fn install_spec(model: &str) -> Option<ModelSpec> {
    CATALOG
        .active_named(model)
        .map(LocalModelManifest::installation)
}

pub fn model_label(key: &str) -> String {
    CATALOG
        .active_named(key)
        .map(|entry| entry.label.to_owned())
        .unwrap_or_else(|| key.to_owned())
}

pub fn model_supports_capability(model_key: &str, capability: &str) -> bool {
    CATALOG
        .active_named(model_key)
        .is_some_and(|entry| entry.supports(capability))
}

pub fn is_streaming_model(model_key: &str) -> bool {
    model_supports_capability(model_key, MODEL_CAPABILITY_STREAMING)
}

pub fn list_local_models() -> Vec<ModelInfo> {
    CATALOG
        .active()
        .map(LocalModelManifest::public_info)
        .collect()
}

pub fn list_models(app: &AppHandle<AppRuntime>, settings: &UserSettings) -> Vec<SpeechModel> {
    compose_models(settings, |key| {
        install::check_model_status(app.clone(), key.to_owned())
            .map(|status| status.installed)
            .unwrap_or(false)
    })
}

pub(crate) fn list_models_at(
    models_dir: &std::path::Path,
    settings: &UserSettings,
) -> Vec<SpeechModel> {
    compose_models(settings, |key| {
        install::check_model_installed_at(models_dir, key)
    })
}

pub(crate) fn configured_remote_model(settings: &UserSettings) -> Option<SpeechModel> {
    remote::has_valid_config(settings).then(|| SpeechModel::remote(settings))
}

pub fn label(model_id: &str) -> String {
    if remote::is_remote_model(model_id) {
        RemoteModelLabel::parse(model_id).render()
    } else {
        model_label(model_id)
    }
}

#[cfg(test)]
#[path = "catalog_contract_tests.rs"]
mod contract_tests;
