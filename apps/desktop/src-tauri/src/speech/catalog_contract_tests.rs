use std::collections::HashSet;

use serde_json::Value;
use tempfile::TempDir;

use super::*;

fn configured_remote_settings(provider: &str, endpoint: &str, model: &str) -> UserSettings {
    UserSettings {
        remote_speech_enabled: true,
        remote_speech_provider: provider.to_owned(),
        remote_speech_endpoint: endpoint.to_owned(),
        remote_speech_api_key: "test-key".to_owned(),
        remote_speech_model: model.to_owned(),
        ..UserSettings::default()
    }
}

fn active_ids() -> Vec<&'static str> {
    local_manifests().map(|manifest| manifest.id).collect()
}

#[test]
fn active_order_is_the_product_default_order_for_this_platform() {
    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
    assert_eq!(
        active_ids(),
        vec!["parakeet_tdt_int8", "cohere_transcribe_int4"]
    );

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    assert_eq!(active_ids(), vec!["cohere_transcribe_int4"]);
}

#[test]
fn settings_default_is_the_first_platform_catalog_entry() {
    let default_model = crate::settings::default_local_model();
    assert_eq!(active_ids().first().copied(), Some(default_model.as_str()));
    assert!(definition(&default_model).is_some());
    assert!(model_is_downloadable(&default_model));
}

#[test]
fn active_entries_have_unique_ids_and_complete_product_metadata() {
    let mut ids = HashSet::new();
    for manifest in local_manifests() {
        assert!(ids.insert(manifest.id));
        assert!(!manifest.label.trim().is_empty());
        assert!(!manifest.description.trim().is_empty());
        assert!(!manifest.family.trim().is_empty());
        assert!(!manifest.variant.trim().is_empty());
        assert_eq!(manifest.category, "standard");
        assert!(!manifest.tags.is_empty());
        assert!(!manifest.files.is_empty());
    }
}

#[test]
fn active_artifacts_keep_size_digest_and_relative_path_contracts() {
    for manifest in local_manifests() {
        for artifact in manifest.files {
            assert!(artifact.size_bytes > 0);
            assert!(!artifact.path.starts_with('/'));
            assert!(!artifact.mirror_path.starts_with('/'));
            assert_eq!(artifact.sha256.len(), 64);
            assert!(artifact.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()));
        }
    }
}

#[test]
fn install_specs_are_lossless_projections_of_active_artifacts() {
    for manifest in local_manifests() {
        let specification = install_spec(manifest.id).unwrap();
        assert_eq!(specification.id, manifest.id);
        assert_eq!(specification.files.len(), manifest.files.len());
        for (remote_file, artifact) in specification.files.iter().zip(manifest.files) {
            assert_eq!(remote_file.path, artifact.path);
            assert_eq!(remote_file.size_bytes, Some(artifact.size_bytes));
            assert_eq!(remote_file.sha256.as_deref(), Some(artifact.sha256));
            assert!(remote_file.url.ends_with(artifact.mirror_path));
            assert!(!remote_file.url.contains("huggingface.co"));
        }
    }
}

#[test]
fn unknown_and_inactive_entries_never_produce_install_specs() {
    for model in [
        "whisper_small_q5",
        "nemotron_35_streaming_multilingual",
        "not-a-model",
    ] {
        assert!(definition(model).is_none());
        assert!(install_spec(model).is_none());
        assert!(!model_is_downloadable(model));
    }
}

#[test]
fn inactive_projection_preserves_order_availability_and_artifacts() {
    let public = list_inactive_models();
    let internal = inactive_manifests().collect::<Vec<_>>();
    assert_eq!(public.len(), internal.len());
    for (info, manifest) in public.iter().zip(internal) {
        assert_eq!(info.id, manifest.id);
        assert_eq!(info.availability, manifest.availability);
        assert_eq!(info.artifacts.len(), manifest.files.len());
        assert_eq!(
            info.capabilities,
            manifest
                .capabilities
                .iter()
                .map(|value| (*value).to_owned())
                .collect::<Vec<_>>()
        );
        let expected_bytes = manifest
            .files
            .iter()
            .map(|artifact| artifact.size_bytes)
            .sum::<u64>();
        assert_eq!(info.size_mb, expected_bytes as f32 / 1_000_000.0);
    }
}

#[test]
fn experimental_and_archived_models_keep_their_declared_order() {
    let availability = inactive_manifests()
        .map(|entry| (entry.id, entry.availability))
        .collect::<Vec<_>>();
    assert_eq!(
        availability,
        vec![
            ("parakeet_unified_en_int8", ModelAvailability::Experimental),
            (
                "nemotron_35_streaming_multilingual",
                ModelAvailability::Experimental
            ),
            ("whisper_large_v3_turbo_q5", ModelAvailability::Experimental),
            ("whisper_small_q5", ModelAvailability::Experimental),
            ("whisper_large_v3_turbo_q8", ModelAvailability::Archived),
            ("distil_whisper_large_v35", ModelAvailability::Archived),
        ]
    );
}

#[test]
fn availability_resolves_public_inactive_retired_and_unknown_states() {
    assert_eq!(
        model_availability("cohere_transcribe_int4"),
        Some(ModelAvailability::Public)
    );
    assert_eq!(
        model_availability("whisper_small_q5"),
        Some(ModelAvailability::Experimental)
    );
    assert_eq!(
        model_availability("whisper_large_v3_turbo_q8"),
        Some(ModelAvailability::Archived)
    );
    assert_eq!(
        model_availability("nemotron_streaming_en"),
        Some(ModelAvailability::Retired)
    );
    assert_eq!(model_availability("missing"), None);
    assert!(!known_model_id("missing"));
}

#[test]
fn inactive_candidates_and_retired_ids_remain_disjoint() {
    for candidate in inactive_manifests() {
        assert!(!RETIRED_MODEL_IDS.contains(&candidate.id));
    }
}

#[test]
fn only_timestamp_capability_is_published_for_active_local_engines() {
    for manifest in local_manifests() {
        assert_eq!(
            model_supports_capability(manifest.id, MODEL_CAPABILITY_TIMESTAMPS),
            manifest.engine.capabilities().timestamps
        );
        for unsupported in [
            MODEL_CAPABILITY_STREAMING,
            MODEL_CAPABILITY_DICTIONARY,
            MODEL_CAPABILITY_DIARIZATION,
            "TIMESTAMPS",
            "unknown",
        ] {
            assert!(!model_supports_capability(manifest.id, unsupported));
        }
        assert!(!is_streaming_model(manifest.id));
    }
}

#[test]
fn model_info_projects_engine_language_size_and_selection_policy() {
    for info in list_local_models() {
        let manifest = definition(&info.key).unwrap();
        assert_eq!(info.size_mb, manifest.bytes() as f32 / 1_000_000.0);
        assert_eq!(info.engine_id, manifest.engine.provider_id());
        assert_eq!(
            info.language_selection_mode,
            manifest.engine.language_selection()
        );
        assert_eq!(info.ane_size_mb, None);
        assert!(info.downloadable);
        assert!(!info.supported_languages.is_empty());
    }
}

#[test]
fn model_info_wire_shape_keeps_all_frontend_fields() {
    let info = list_local_models().into_iter().next().unwrap();
    let json = serde_json::to_value(info).unwrap();
    let object = json.as_object().unwrap();
    let expected = [
        "key",
        "label",
        "description",
        "size_mb",
        "engine_id",
        "family",
        "variant",
        "category",
        "downloadable",
        "tags",
        "capabilities",
        "supported_languages",
        "language_selection_mode",
        "ane_size_mb",
    ];
    assert_eq!(object.len(), expected.len());
    for field in expected {
        assert!(object.contains_key(field), "missing {field}");
    }
}

#[test]
fn local_label_uses_catalog_name_and_unknown_label_is_stable() {
    assert_eq!(model_label("cohere_transcribe_int4"), "Cohere Transcribe");
    assert_eq!(label("cohere_transcribe_int4"), "Cohere Transcribe");
    assert_eq!(model_label("vendor-model"), "vendor-model");
    assert_eq!(label("vendor-model"), "vendor-model");
}

#[test]
fn remote_token_labels_cover_known_custom_and_missing_providers() {
    let cases = [
        ("remote:openai:whisper-1", "OpenAI · whisper-1"),
        (" remote:groq:distil-whisper ", "Groq · distil-whisper"),
        ("remote:mistral", "Mistral"),
        ("remote:fireworks:model", "Fireworks · model"),
        ("remote:openrouter:model", "OpenRouter · model"),
        ("remote:deepgram:model", "Deepgram · model"),
        ("remote:elevenlabs:model", "ElevenLabs · model"),
        ("remote:custom:model", "Custom · model"),
        ("remote:ACME:model", "acme · model"),
        ("remote:", "Remote"),
    ];
    for (token, expected) in cases {
        assert_eq!(label(token), expected);
    }
}

#[test]
fn remote_projection_is_installed_and_keeps_capability_order() {
    let settings = configured_remote_settings(
        "mistral",
        "https://api.mistral.ai/v1/audio/transcriptions",
        "voxtral-mini-latest",
    );
    let remote_model = SpeechModel::remote(&settings);
    assert!(remote_model.remote);
    assert!(remote_model.installed);
    assert_eq!(remote_model.engine_id, "remote");
    assert_eq!(remote_model.tags, vec!["Remote"]);
    assert_eq!(
        remote_model.capabilities,
        vec![
            MODEL_CAPABILITY_TIMESTAMPS,
            MODEL_CAPABILITY_DICTIONARY,
            MODEL_CAPABILITY_DIARIZATION,
        ]
    );
    assert_eq!(remote_model.label, "Mistral · voxtral-mini-latest");
}

#[test]
fn configured_remote_lookup_does_not_require_provider_to_be_enabled() {
    let mut settings = configured_remote_settings(
        "openai",
        "https://api.openai.com/v1/audio/transcriptions",
        "whisper-1",
    );
    settings.remote_speech_enabled = false;
    assert!(configured_remote_model(&settings).is_some());
}

#[test]
fn composed_list_places_enabled_remote_before_local_catalog() {
    let settings = configured_remote_settings(
        "openai",
        "https://api.openai.com/v1/audio/transcriptions",
        "whisper-1",
    );
    let models = compose_models(&settings, |_| false);
    assert!(models[0].remote);
    assert_eq!(
        models
            .iter()
            .skip(1)
            .map(|model| model.key.as_str())
            .collect::<Vec<_>>(),
        active_ids()
    );
    assert!(models.iter().skip(1).all(|model| !model.installed));
}

#[test]
fn path_based_listing_reflects_empty_cache_without_network() {
    let directory = TempDir::new().unwrap();
    let settings = UserSettings::default();
    let models = list_models_at(directory.path(), &settings);
    assert_eq!(models.len(), active_ids().len());
    assert!(models.iter().all(|model| !model.remote && !model.installed));
}

#[test]
fn speech_model_wire_contract_keeps_boolean_and_capability_fields() {
    let info = list_local_models().into_iter().next().unwrap();
    let value = serde_json::to_value(SpeechModel::local(info, true)).unwrap();
    let object = value.as_object().unwrap();
    assert_eq!(object.get("remote"), Some(&Value::Bool(false)));
    assert_eq!(object.get("installed"), Some(&Value::Bool(true)));
    assert!(object.get("capabilities").is_some_and(Value::is_array));
    assert!(object
        .get("supported_languages")
        .is_some_and(Value::is_array));
}
