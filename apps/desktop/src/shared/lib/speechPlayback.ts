const LANGUAGE_TAGS: Record<string, string> = {
  Arabic: "ar",
  "Chinese (Simplified)": "zh-CN",
  "Chinese (Traditional)": "zh-TW",
  Dutch: "nl",
  English: "en",
  French: "fr",
  German: "de",
  Hindi: "hi",
  Indonesian: "id",
  Italian: "it",
  Japanese: "ja",
  Korean: "ko",
  Polish: "pl",
  Portuguese: "pt",
  Russian: "ru",
  Spanish: "es",
  Turkish: "tr",
  Ukrainian: "uk",
  Vietnamese: "vi",
};

export function languageTagForSpeech(language?: string | null): string {
  if (!language) return "";
  return LANGUAGE_TAGS[language] ?? language;
}

export function splitSpeechText(text: string, maxLength = 240): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const segments = normalized.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [
    normalized,
  ];
  const chunks: string[] = [];
  let current = "";
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (current && current.length + 1 + trimmed.length <= maxLength) {
      current = `${current} ${trimmed}`;
      continue;
    }
    if (current) chunks.push(current);
    if (trimmed.length <= maxLength) {
      current = trimmed;
      continue;
    }

    const words = trimmed.split(" ");
    current = "";
    for (const word of words) {
      if (current && current.length + 1 + word.length > maxLength) {
        chunks.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
