use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use pbkdf2::pbkdf2_hmac_array;
use rand::Rng;
use sha2::Sha256;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::OnceLock;

const DEVICE_KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;
const AUTHENTICATION_TAG_BYTES: usize = 16;
const KEY_STRETCH_ROUNDS: u32 = 100_000;
const KEY_CONTEXT: &[u8] = b"looper_api_key_v1";
const CLEAR_TEXT_MARKERS: [&str; 6] = ["sk-", "pk-", "api-", "key-", "token-", "bearer-"];
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

type DeviceKey = [u8; DEVICE_KEY_BYTES];
type StoredNonce = [u8; NONCE_BYTES];

static FIRST_DEVICE_KEY: OnceLock<(String, DeviceKey)> = OnceLock::new();
#[cfg(target_os = "windows")]
static WINDOWS_HARDWARE_UUID: OnceLock<Option<String>> = OnceLock::new();

struct DeviceCipher(Aes256Gcm);

impl DeviceCipher {
    fn for_hardware(hardware_uuid: &str) -> Result<Self, String> {
        let key = device_key(hardware_uuid);
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|error| format!("Failed to create cipher: {error}"))?;
        Ok(Self(cipher))
    }

    fn seal(&self, nonce_bytes: &StoredNonce, cleartext: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = Nonce::try_from(nonce_bytes.as_slice())
            .map_err(|_| "Failed to create nonce".to_string())?;
        self.0
            .encrypt(&nonce, cleartext)
            .map_err(|error| format!("Encryption failed: {error}"))
    }

    fn open(&self, nonce_bytes: &StoredNonce, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = Nonce::try_from(nonce_bytes.as_slice())
            .map_err(|_| "Invalid nonce in ciphertext".to_string())?;
        self.0
            .decrypt(&nonce, ciphertext)
            .map_err(|_| "Decryption failed - different hardware or corrupted data".to_string())
    }
}

struct CipherEnvelope {
    nonce: StoredNonce,
    ciphertext: Vec<u8>,
}

impl CipherEnvelope {
    fn seal(cleartext: &[u8], hardware_uuid: &str) -> Result<Self, String> {
        let cipher = DeviceCipher::for_hardware(hardware_uuid)?;
        let nonce = random_nonce();
        let ciphertext = cipher.seal(&nonce, cleartext)?;
        Ok(Self { nonce, ciphertext })
    }

    fn from_encoded(encoded: &str) -> Result<Self, String> {
        let payload = BASE64
            .decode(encoded)
            .map_err(|error| format!("Invalid base64: {error}"))?;
        if payload.len() < NONCE_BYTES {
            return Err("Ciphertext too short".to_string());
        }

        let (nonce_slice, ciphertext) = payload.split_at(NONCE_BYTES);
        let nonce = nonce_slice
            .try_into()
            .map_err(|_| "Invalid nonce in ciphertext".to_string())?;
        Ok(Self {
            nonce,
            ciphertext: ciphertext.to_vec(),
        })
    }

    fn encode(self) -> String {
        let mut payload = Vec::with_capacity(NONCE_BYTES + self.ciphertext.len());
        payload.extend_from_slice(&self.nonce);
        payload.extend_from_slice(&self.ciphertext);
        BASE64.encode(payload)
    }
}

fn derive_device_key(hardware_uuid: &str) -> DeviceKey {
    pbkdf2_hmac_array::<Sha256, DEVICE_KEY_BYTES>(
        hardware_uuid.as_bytes(),
        KEY_CONTEXT,
        KEY_STRETCH_ROUNDS,
    )
}

fn device_key(hardware_uuid: &str) -> DeviceKey {
    let remembered = FIRST_DEVICE_KEY
        .get_or_init(|| (hardware_uuid.to_owned(), derive_device_key(hardware_uuid)));
    if remembered.0 == hardware_uuid {
        remembered.1
    } else {
        derive_device_key(hardware_uuid)
    }
}

fn random_nonce() -> StoredNonce {
    let mut bytes = [0_u8; NONCE_BYTES];
    rand::rng().fill_bytes(&mut bytes);
    bytes
}

#[cfg(any(target_os = "macos", test))]
fn uuid_from_ioreg(report: &[u8]) -> Option<String> {
    String::from_utf8_lossy(report)
        .lines()
        .filter(|line| line.contains("IOPlatformUUID"))
        .find_map(|line| line.split('"').nth(3))
        .map(str::to_owned)
}

#[cfg(target_os = "macos")]
pub fn get_hardware_uuid() -> Option<String> {
    let report = Command::new("/usr/sbin/ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    uuid_from_ioreg(&report.stdout)
}

#[cfg(any(target_os = "windows", test))]
fn first_nonempty_line(report: &[u8], lines_to_skip: usize) -> Option<String> {
    String::from_utf8_lossy(report)
        .lines()
        .skip(lines_to_skip)
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
}

#[cfg(target_os = "windows")]
fn query_windows_hardware_uuid() -> Option<String> {
    let powershell = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
        ])
        .output()
        .ok();
    if let Some(report) = powershell.filter(|report| report.status.success()) {
        if let Some(uuid) = first_nonempty_line(&report.stdout, 0) {
            return Some(uuid);
        }
    }

    let legacy_report = Command::new("wmic")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["csproduct", "get", "uuid"])
        .output()
        .ok()?;
    first_nonempty_line(&legacy_report.stdout, 1)
}

#[cfg(target_os = "windows")]
pub fn get_hardware_uuid() -> Option<String> {
    WINDOWS_HARDWARE_UUID
        .get_or_init(query_windows_hardware_uuid)
        .clone()
}

pub fn encrypt(plaintext: &str, hardware_uuid: &str) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    CipherEnvelope::seal(plaintext.as_bytes(), hardware_uuid).map(CipherEnvelope::encode)
}

pub fn decrypt(encrypted: &str, hardware_uuid: &str) -> Result<String, String> {
    if encrypted.is_empty() {
        return Ok(String::new());
    }

    let cipher = DeviceCipher::for_hardware(hardware_uuid)?;
    let envelope = CipherEnvelope::from_encoded(encrypted)?;
    let cleartext = cipher.open(&envelope.nonce, &envelope.ciphertext)?;
    String::from_utf8(cleartext)
        .map_err(|error| format!("Invalid UTF-8 in decrypted data: {error}"))
}

pub fn looks_encrypted(value: &str) -> bool {
    if value.is_empty() || value.len() < 40 {
        return false;
    }

    let normalized = value.to_lowercase();
    if CLEAR_TEXT_MARKERS
        .iter()
        .any(|marker| normalized.starts_with(marker))
    {
        return false;
    }

    let minimum_payload = NONCE_BYTES + AUTHENTICATION_TAG_BYTES + 1;
    BASE64
        .decode(value)
        .is_ok_and(|decoded| decoded.len() >= minimum_payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_HARDWARE_UUID: &str = "fixture-machine-uuid";
    const FIXTURE_PLAINTEXT: &str = "existing-api-key";
    const FIXTURE_CIPHERTEXT: &str = "AAECAwQFBgcICQoL8gWbTTGdMUzYL+7TNY9DsjyNI12Dff8Mc7633u9qpNE=";
    const INVALID_UTF8_CIPHERTEXT: &str = "AAECAwQFBgcICQoLaIMPeBXKv2klZ15/1WlBCxJnKA==";

    fn fixture_nonce() -> StoredNonce {
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    }

    #[test]
    fn persisted_ciphertext_fixture_remains_readable() {
        assert_eq!(
            decrypt(FIXTURE_CIPHERTEXT, FIXTURE_HARDWARE_UUID).as_deref(),
            Ok(FIXTURE_PLAINTEXT)
        );
    }

    #[test]
    fn fixed_nonce_produces_the_existing_persisted_format() {
        let cipher = DeviceCipher::for_hardware(FIXTURE_HARDWARE_UUID).expect("build cipher");
        let envelope = CipherEnvelope {
            nonce: fixture_nonce(),
            ciphertext: cipher
                .seal(&fixture_nonce(), FIXTURE_PLAINTEXT.as_bytes())
                .expect("seal fixture"),
        };

        assert_eq!(envelope.encode(), FIXTURE_CIPHERTEXT);
    }

    #[test]
    fn encryption_round_trips_unicode_and_large_values() {
        let plaintext = "dictado 🎙️ con acentos y \0 internos\n".repeat(2_048);
        let encrypted = encrypt(&plaintext, FIXTURE_HARDWARE_UUID).expect("encrypt value");

        assert!(looks_encrypted(&encrypted));
        assert_eq!(
            decrypt(&encrypted, FIXTURE_HARDWARE_UUID).as_deref(),
            Ok(plaintext.as_str())
        );
    }

    #[test]
    fn empty_values_keep_the_empty_storage_representation() {
        assert_eq!(encrypt("", FIXTURE_HARDWARE_UUID).as_deref(), Ok(""));
        assert_eq!(decrypt("", FIXTURE_HARDWARE_UUID).as_deref(), Ok(""));
        assert!(!looks_encrypted(""));
    }

    #[test]
    fn a_different_hardware_identifier_cannot_open_the_fixture() {
        assert_eq!(
            decrypt(FIXTURE_CIPHERTEXT, "another-machine"),
            Err("Decryption failed - different hardware or corrupted data".to_string())
        );
    }

    #[test]
    fn corrupted_ciphertext_uses_the_existing_public_error() {
        let mut payload = BASE64.decode(FIXTURE_CIPHERTEXT).expect("decode fixture");
        *payload.last_mut().expect("authentication tag") ^= 0x01;
        let corrupted = BASE64.encode(payload);

        assert_eq!(
            decrypt(&corrupted, FIXTURE_HARDWARE_UUID),
            Err("Decryption failed - different hardware or corrupted data".to_string())
        );
    }

    #[test]
    fn malformed_storage_reports_the_same_error_categories() {
        assert_eq!(
            decrypt("not-base64!", FIXTURE_HARDWARE_UUID),
            Err("Invalid base64: Invalid symbol 45, offset 3.".to_string())
        );
        assert_eq!(
            decrypt("AA==", FIXTURE_HARDWARE_UUID),
            Err("Ciphertext too short".to_string())
        );
    }

    #[test]
    fn authenticated_non_utf8_data_reaches_the_utf8_error() {
        assert_eq!(
            decrypt(INVALID_UTF8_CIPHERTEXT, FIXTURE_HARDWARE_UUID),
            Err(
                "Invalid UTF-8 in decrypted data: invalid utf-8 sequence of 1 bytes from index 0"
                    .to_string()
            )
        );
    }

    #[test]
    fn encrypted_heuristic_preserves_prefix_and_payload_boundaries() {
        for prefix in ["sk-", "PK-", "Api-", "key-", "TOKEN-", "Bearer-"] {
            let apparent_key = format!("{prefix}{}", "x".repeat(50));
            assert!(!looks_encrypted(&apparent_key));
        }

        assert!(!looks_encrypted(&BASE64.encode([0_u8; 28])));
        assert!(looks_encrypted(&BASE64.encode([0_u8; 29])));
        assert!(!looks_encrypted(&"!".repeat(40)));
    }

    #[test]
    fn key_derivation_matches_the_persisted_contract() {
        assert_eq!(
            derive_device_key(FIXTURE_HARDWARE_UUID),
            [
                0x09, 0x0c, 0xa0, 0x84, 0xea, 0xe1, 0x1d, 0x6b, 0xc1, 0xf7, 0x19, 0xe0, 0xd3, 0x9c,
                0x88, 0xe4, 0x89, 0x7b, 0x71, 0xe6, 0x87, 0x5e, 0x97, 0x4a, 0x08, 0x7e, 0x3f, 0x2c,
                0x21, 0x2f, 0x13, 0x2c,
            ]
        );
    }

    #[test]
    fn ioreg_parser_ignores_malformed_matches_before_the_uuid() {
        let report = br#"
            | |   "IOPlatformUUID"
            | |   "IOPlatformUUID" = "ABCDEF01-2345-6789-ABCD-EF0123456789"
        "#;

        assert_eq!(
            uuid_from_ioreg(report).as_deref(),
            Some("ABCDEF01-2345-6789-ABCD-EF0123456789")
        );
    }

    #[test]
    fn windows_report_parser_preserves_modern_and_legacy_line_rules() {
        let powershell = b"\r\n  ABCDEF01-2345-6789-ABCD-EF0123456789  \r\n";
        let wmic = b"UUID\r\n\r\n  FEDCBA98-7654-3210-FEDC-BA9876543210  \r\n";

        assert_eq!(
            first_nonempty_line(powershell, 0).as_deref(),
            Some("ABCDEF01-2345-6789-ABCD-EF0123456789")
        );
        assert_eq!(
            first_nonempty_line(wmic, 1).as_deref(),
            Some("FEDCBA98-7654-3210-FEDC-BA9876543210")
        );
    }
}
