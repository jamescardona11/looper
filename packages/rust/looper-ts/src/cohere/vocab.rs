// Adapted from transcribe-rs 0.3.11 at revision
// 343768c100d566b135fbb7a2441e61fa8aa177f2.
// Copyright (c) 2025 Ilya Stupakov. Licensed under MIT; see THIRD_PARTY_NOTICES.md.

use std::fs;
use std::path::Path;

use crate::{Error, Result};

pub(super) fn load(path: &Path) -> Result<Vec<String>> {
    let content = fs::read_to_string(path).map_err(|error| {
        Error::Config(format!(
            "failed to read Cohere vocabulary {}: {error}",
            path.display()
        ))
    })?;
    let mut entries = Vec::new();
    let mut highest_id = None;

    for line in content.lines() {
        let Some((token, id)) = line.trim_end().rsplit_once(' ') else {
            continue;
        };
        let Ok(id) = id.parse::<usize>() else {
            continue;
        };
        highest_id = Some(highest_id.map_or(id, |highest: usize| highest.max(id)));
        entries.push((token.replace('▁', " "), id));
    }

    let Some(highest_id) = highest_id else {
        return Err(Error::Config(format!(
            "Cohere vocabulary is empty: {}",
            path.display()
        )));
    };
    let mut vocabulary = vec![String::new(); highest_id + 1];
    for (token, id) in entries {
        vocabulary[id] = token;
    }
    Ok(vocabulary)
}

pub(super) fn parse_byte_token(token: &str) -> Option<u8> {
    if token.starts_with("<0x") && token.ends_with('>') && token.len() == 6 {
        u8::from_str_radix(&token[3..5], 16).ok()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn loads_vocabulary_by_id_and_replaces_sentencepiece_boundaries() {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        writeln!(file, "▁world 1").unwrap();
        writeln!(file, "▁hello 0").unwrap();

        let vocabulary = load(file.path()).unwrap();

        assert_eq!(vocabulary, [" hello", " world"]);
    }

    #[test]
    fn recognizes_only_well_formed_byte_tokens() {
        assert_eq!(parse_byte_token("<0xE5>"), Some(0xE5));
        assert_eq!(parse_byte_token("<0xGG>"), None);
        assert_eq!(parse_byte_token("<|en|>"), None);
    }
}
