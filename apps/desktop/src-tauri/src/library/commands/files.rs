use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::{Context, Result};
use tauri::AppHandle;

use crate::AppRuntime;

use super::super::processing::library_root;

enum ManagedAudio {
    File(PathBuf),
    Directory(PathBuf),
    External,
}

impl ManagedAudio {
    fn remove(self) -> Result<(), String> {
        match self {
            Self::File(path) if path.exists() => fs::remove_file(path)
                .map_err(|error| format!("Failed to delete library file: {error}")),
            Self::Directory(path) if path.exists() => fs::remove_dir_all(path)
                .map_err(|error| format!("Failed to delete library files: {error}")),
            _ => Ok(()),
        }
    }
}

pub(super) fn delete_managed_audio(
    app: &AppHandle<AppRuntime>,
    audio_path: &str,
) -> Result<(), String> {
    deletion_scope(app, audio_path).remove()
}

pub(super) fn write_export(path: &str, content: &str) -> Result<(), String> {
    let destination = validated_export_destination(path)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .context("Failed to create export directory")
            .map_err(|error| error.to_string())?;
    }
    fs::write(&destination, content.as_bytes())
        .context("Failed to write export file")
        .map_err(|error| error.to_string())
}

fn validated_export_destination(path: &str) -> Result<PathBuf, String> {
    let destination = PathBuf::from(path);
    if !destination.is_absolute() {
        return Err("Export path must be absolute".to_owned());
    }
    if has_parent_traversal(&destination) {
        return Err("Export path contains invalid components".to_owned());
    }
    Ok(destination)
}

fn deletion_scope(app: &AppHandle<AppRuntime>, raw_path: &str) -> ManagedAudio {
    let candidate = PathBuf::from(raw_path);
    if !candidate.is_absolute() || has_parent_traversal(&candidate) {
        return ManagedAudio::External;
    }
    let root = match canonical_library_root(app) {
        Ok(root) => root,
        Err(error) => {
            tracing::error!("Skipping library file deletion: {error}");
            return ManagedAudio::External;
        }
    };
    deletion_scope_from_paths(&root, &candidate)
}

fn canonical_library_root(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    let root = library_root(app)?;
    root.canonicalize()
        .context("Failed to resolve library storage location.")
}

fn has_parent_traversal(path: &Path) -> bool {
    path.components()
        .any(|component| component == Component::ParentDir)
}

fn deletion_scope_from_paths(root: &Path, candidate: &Path) -> ManagedAudio {
    let Some(safe_path) = canonical_candidate(candidate) else {
        return ManagedAudio::External;
    };
    if !safe_path.starts_with(root) {
        return ManagedAudio::External;
    }
    match safe_path.parent() {
        Some(parent) if parent == root => ManagedAudio::File(safe_path),
        Some(parent) if parent.exists() => ManagedAudio::Directory(parent.to_owned()),
        _ if safe_path.exists() => ManagedAudio::File(safe_path),
        _ => ManagedAudio::External,
    }
}

fn canonical_candidate(path: &Path) -> Option<PathBuf> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|error| {
                tracing::error!(
                    "Skipping library file deletion, failed to canonicalize file: {error}"
                );
            })
            .ok();
    }
    let Some(parent) = path.parent() else {
        return Some(path.to_owned());
    };
    if !parent.exists() {
        return Some(path.to_owned());
    }
    parent
        .canonicalize()
        .map(|resolved| resolved.join(path.file_name().unwrap_or_default()))
        .map_err(|error| {
            tracing::error!(
                "Skipping library file deletion, failed to canonicalize parent folder: {error}"
            );
        })
        .ok()
}

#[cfg(test)]
mod tests {
    use super::{deletion_scope_from_paths, validated_export_destination, ManagedAudio};
    use std::path::Path;

    #[test]
    fn export_destination_rejects_relative_and_parent_traversal_paths() {
        let absolute = std::env::temp_dir().join("looper-export.md");
        let traversing = std::env::temp_dir()
            .join("..")
            .join("private")
            .join("looper-export.md");

        assert_eq!(
            validated_export_destination("notes/export.md").unwrap_err(),
            "Export path must be absolute"
        );
        assert_eq!(
            validated_export_destination(&traversing.to_string_lossy()).unwrap_err(),
            "Export path contains invalid components"
        );
        assert_eq!(
            validated_export_destination(&absolute.to_string_lossy()).unwrap(),
            absolute
        );
    }

    #[test]
    fn deletion_policy_never_crosses_the_managed_root() {
        let root = std::env::temp_dir().canonicalize().unwrap();
        let managed = root.join("looper-managed-audio.wav");
        let external = root
            .parent()
            .unwrap_or_else(|| Path::new("/"))
            .join("looper-external-audio.wav");

        assert!(matches!(
            deletion_scope_from_paths(&root, &external),
            ManagedAudio::External
        ));
        assert!(matches!(
            deletion_scope_from_paths(&root, &managed),
            ManagedAudio::File(_)
        ));
    }
}
