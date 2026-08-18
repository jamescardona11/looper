use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct SupportedLanguageInfo {
    pub code: String,
    pub name: String,
}

const WHISPER_LANGUAGE_ROWS: &[&str] = &[
    "en|English",
    "zh|Chinese",
    "de|German",
    "es|Spanish",
    "ru|Russian",
    "ko|Korean",
    "fr|French",
    "ja|Japanese",
    "pt|Portuguese",
    "tr|Turkish",
    "pl|Polish",
    "ca|Catalan",
    "nl|Dutch",
    "ar|Arabic",
    "sv|Swedish",
    "it|Italian",
    "id|Indonesian",
    "hi|Hindi",
    "fi|Finnish",
    "vi|Vietnamese",
    "he|Hebrew",
    "uk|Ukrainian",
    "el|Greek",
    "ms|Malay",
    "cs|Czech",
    "ro|Romanian",
    "da|Danish",
    "hu|Hungarian",
    "ta|Tamil",
    "nb|Norwegian Bokmål",
    "no|Norwegian",
    "th|Thai",
    "ur|Urdu",
    "hr|Croatian",
    "bg|Bulgarian",
    "lt|Lithuanian",
    "la|Latin",
    "mi|Maori",
    "ml|Malayalam",
    "cy|Welsh",
    "sk|Slovak",
    "te|Telugu",
    "fa|Persian",
    "lv|Latvian",
    "bn|Bengali",
    "sr|Serbian",
    "az|Azerbaijani",
    "sl|Slovenian",
    "kn|Kannada",
    "et|Estonian",
    "mk|Macedonian",
    "br|Breton",
    "eu|Basque",
    "is|Icelandic",
    "hy|Armenian",
    "ne|Nepali",
    "mn|Mongolian",
    "bs|Bosnian",
    "kk|Kazakh",
    "sq|Albanian",
    "sw|Swahili",
    "gl|Galician",
    "mr|Marathi",
    "pa|Punjabi",
    "si|Sinhala",
    "km|Khmer",
    "sn|Shona",
    "yo|Yoruba",
    "so|Somali",
    "af|Afrikaans",
    "oc|Occitan",
    "ka|Georgian",
    "be|Belarusian",
    "tg|Tajik",
    "sd|Sindhi",
    "gu|Gujarati",
    "am|Amharic",
    "yi|Yiddish",
    "lo|Lao",
    "uz|Uzbek",
    "fo|Faroese",
    "ht|Haitian Creole",
    "ps|Pashto",
    "tk|Turkmen",
    "nn|Nynorsk",
    "mt|Maltese",
    "sa|Sanskrit",
    "lb|Luxembourgish",
    "my|Myanmar",
    "bo|Tibetan",
    "tl|Tagalog",
    "mg|Malagasy",
    "as|Assamese",
    "tt|Tatar",
    "haw|Hawaiian",
    "ln|Lingala",
    "ha|Hausa",
    "ba|Bashkir",
    "jw|Javanese",
    "su|Sundanese",
    "yue|Cantonese",
];

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
const PARAKEET_V3_LANGUAGE_SEQUENCE: &str =
    "bg hr cs da nl en et fi fr de el hu it lv lt mt pl pt ro sk sl es sv ru uk";

const COHERE_LANGUAGE_SEQUENCE: &str = "en de fr it es pt el nl pl ar vi zh ja ko";

fn language_name(code: &str) -> Option<&'static str> {
    WHISPER_LANGUAGE_ROWS
        .iter()
        .map(|row| parse_language_row(row))
        .find_map(|(candidate, name)| (candidate == code).then_some(name))
}

fn parse_language_row(row: &'static str) -> (&'static str, &'static str) {
    row.split_once('|')
        .expect("language catalog rows always contain a separator")
}

fn supported_languages_for_sequence(sequence: &str) -> Vec<SupportedLanguageInfo> {
    sequence
        .split_ascii_whitespace()
        .map(|code| SupportedLanguageInfo {
            code: code.to_string(),
            name: language_name(code).unwrap_or(code).to_string(),
        })
        .collect()
}

pub fn whisper_supported_languages() -> Vec<SupportedLanguageInfo> {
    WHISPER_LANGUAGE_ROWS
        .iter()
        .map(|row| {
            let (code, name) = parse_language_row(row);
            SupportedLanguageInfo {
                code: code.to_string(),
                name: name.to_string(),
            }
        })
        .collect()
}

pub fn cohere_supported_languages() -> Vec<SupportedLanguageInfo> {
    supported_languages_for_sequence(COHERE_LANGUAGE_SEQUENCE)
}

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
pub fn parakeet_v3_supported_languages() -> Vec<SupportedLanguageInfo> {
    supported_languages_for_sequence(PARAKEET_V3_LANGUAGE_SEQUENCE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whisper_catalog_preserves_order_names_and_size() {
        let languages = whisper_supported_languages();

        assert_eq!(languages.len(), 101);
        assert_eq!(
            (languages[0].code.as_str(), languages[0].name.as_str()),
            ("en", "English")
        );
        assert_eq!(
            (languages[29].code.as_str(), languages[29].name.as_str()),
            ("nb", "Norwegian Bokmål")
        );
        assert_eq!(
            (languages[100].code.as_str(), languages[100].name.as_str()),
            ("yue", "Cantonese")
        );
    }

    #[test]
    fn cohere_catalog_preserves_provider_sequence() {
        let languages = cohere_supported_languages();
        let codes: Vec<_> = languages
            .iter()
            .map(|language| language.code.as_str())
            .collect();

        assert_eq!(
            codes,
            COHERE_LANGUAGE_SEQUENCE
                .split_ascii_whitespace()
                .collect::<Vec<_>>()
        );
        assert_eq!(languages[9].name, "Arabic");
    }

    #[test]
    fn language_payload_keeps_frontend_wire_fields() {
        let value = serde_json::to_value(&cohere_supported_languages()[0]).unwrap();

        assert_eq!(
            value,
            serde_json::json!({ "code": "en", "name": "English" })
        );
    }
}
