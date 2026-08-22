// Adapted from parakeet-rs 0.3.6 at revision
// 7deba612fc9a30c4a7182f4eaa53554cb2fa42c8.
// Copyright (c) 2025 Enes Altun. Licensed under MIT; see the root THIRD_PARTY_NOTICES.md.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use crate::{Error, Result};

#[derive(Debug)]
pub(super) struct Vocabulary {
    tokens: Vec<String>,
}

impl Vocabulary {
    pub fn load(path: &Path) -> Result<Self> {
        let reader = BufReader::new(File::open(path).map_err(|error| {
            Error::Config(format!(
                "failed to open Parakeet vocabulary {}: {error}",
                path.display()
            ))
        })?);
        let mut tokens = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|error| {
                Error::Config(format!(
                    "failed to read Parakeet vocabulary {}: {error}",
                    path.display()
                ))
            })?;
            let Some((token, id)) = line.rsplit_once(' ') else {
                continue;
            };
            let id = id.parse::<usize>().map_err(|error| {
                Error::Config(format!(
                    "invalid token ID `{id}` in {}: {error}",
                    path.display()
                ))
            })?;
            if id >= tokens.len() {
                tokens.resize(id + 1, String::new());
            }
            tokens[id] = token.to_string();
        }

        if tokens.is_empty() {
            return Err(Error::Config(format!(
                "Parakeet vocabulary is empty: {}",
                path.display()
            )));
        }

        Ok(Self { tokens })
    }

    pub fn len(&self) -> usize {
        self.tokens.len()
    }

    pub fn token(&self, id: usize) -> Option<&str> {
        self.tokens.get(id).map(String::as_str)
    }

    #[cfg(test)]
    pub fn from_tokens(tokens: &[&str]) -> Self {
        Self {
            tokens: tokens.iter().map(|token| (*token).to_string()).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn loads_tokens_by_explicit_id() {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        writeln!(file, "world 1").unwrap();
        writeln!(file, "hello 0").unwrap();

        let vocabulary = Vocabulary::load(file.path()).unwrap();

        assert_eq!(vocabulary.token(0), Some("hello"));
        assert_eq!(vocabulary.token(1), Some("world"));
    }
}
