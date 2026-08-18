export interface ImportedReplacement {
  source: string;
  destination: string;
}

export interface ImportedStyle {
  name: string;
  instructions: string;
}

export interface ImportedTranscript {
  text: string;
  occurredAt: number;
}

export interface MobileImportBundle {
  source: string;
  dictionary: string[];
  replacements: ImportedReplacement[];
  styles: ImportedStyle[];
  transcripts: ImportedTranscript[];
  language: string | null;
}

export function parseMobileImport(name: string, raw: string): MobileImportBundle {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("El archivo está vacío.");
  if (!name.toLocaleLowerCase().endsWith(".json")) {
    return {
      source: name,
      dictionary: [],
      replacements: [],
      styles: [],
      transcripts: [{ text: trimmed, occurredAt: Date.now() }],
      language: null,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new Error("El JSON no es válido.");
  }
  const root = asRecord(value);
  if (!root) throw new Error("El archivo no contiene una exportación compatible.");
  const settings = asRecord(root.settings) ?? root;
  const source = detectSource(root, settings, name);
  const dictionary = uniqueStrings([
    ...strings(root.dictionary),
    ...strings(root.vocabulary),
    ...strings(settings.custom_words),
    ...strings(settings.dictionary),
  ]);
  const replacements = uniqueReplacements([
    ...replacementList(root.replacements),
    ...replacementList(settings.replacements),
  ]);
  const styles = uniqueStyles([
    ...styleList(root.personalities),
    ...styleList(root.styles),
    ...customInstructionStyle(root.customInstructions, source),
  ]);
  const transcripts = uniqueTranscripts([
    ...transcriptList(root.history),
    ...transcriptList(root.transcripts),
    ...singleTranscript(root),
  ]);
  const language = stringValue(root.language) ?? stringValue(settings.selected_language);

  if (
    dictionary.length === 0 &&
    replacements.length === 0 &&
    styles.length === 0 &&
    transcripts.length === 0 &&
    !language
  ) {
    throw new Error("No encontramos diccionario, estilos ni transcripciones compatibles.");
  }
  return { source, dictionary, replacements, styles, transcripts, language };
}

function detectSource(
  root: Record<string, unknown>,
  settings: Record<string, unknown>,
  fallback: string,
): string {
  if (Array.isArray(root.vocabulary) || Array.isArray(root.favoriteModelIDs)) return "superwhisper";
  if (root.customInstructions !== undefined || root.startOnStartup !== undefined) return "Aqua Voice";
  if (settings.custom_words !== undefined || settings.selected_model !== undefined) return "Handy";
  return stringValue(root.source) ?? fallback;
}

function replacementList(value: unknown): ImportedReplacement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const source =
      stringValue(record.source) ?? stringValue(record.from) ?? stringValue(record.original);
    const destination =
      stringValue(record.destination) ?? stringValue(record.to) ?? stringValue(record.replacement);
    return source && destination ? [{ source, destination }] : [];
  });
}

function styleList(value: unknown): ImportedStyle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const name = stringValue(record.name);
    const instructions =
      stringValue(record.instructions) ??
      stringValue(record.prompt) ??
      strings(record.instructions).join("\n");
    return name && instructions ? [{ name, instructions }] : [];
  });
}

function customInstructionStyle(value: unknown, source: string): ImportedStyle[] {
  const instructions = stringValue(value);
  return instructions ? [{ name: source, instructions }] : [];
}

function transcriptList(value: unknown): ImportedTranscript[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => transcriptFromValue(entry));
}

function singleTranscript(root: Record<string, unknown>): ImportedTranscript[] {
  return root.result !== undefined || root.text !== undefined ? transcriptFromValue(root) : [];
}

function transcriptFromValue(value: unknown): ImportedTranscript[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [{ text, occurredAt: Date.now() }] : [];
  }
  const record = asRecord(value);
  if (!record) return [];
  const text = ["text", "transcript", "result", "content", "processedResult"]
    .map((key) => stringValue(record[key]))
    .find(Boolean);
  if (!text) return [];
  const timestamp = ["timestamp", "createdAt", "date", "time", "datetime"]
    .map((key) => record[key])
    .find((item) => item !== undefined);
  return [{ text, occurredAt: timestampValue(timestamp) }];
}

function timestampValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values()];
}

function uniqueReplacements(values: ImportedReplacement[]): ImportedReplacement[] {
  return [...new Map(values.map((value) => [value.source.toLocaleLowerCase(), value])).values()];
}

function uniqueStyles(values: ImportedStyle[]): ImportedStyle[] {
  return [...new Map(values.map((value) => [value.name.toLocaleLowerCase(), value])).values()];
}

function uniqueTranscripts(values: ImportedTranscript[]): ImportedTranscript[] {
  return [...new Map(values.map((value) => [value.text, value])).values()];
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = stringValue(item);
    return text ? [text] : [];
  });
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
