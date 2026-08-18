import type {
  DictationSettingsDoc,
  DictionaryEntry,
  ReplacementRule,
  UserSnippet,
} from "../../types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function dictionaryEntryFromRow(row: unknown): DictionaryEntry {
  const record = asRecord(row) ?? {};
  return {
    id: stringField(record, "_id"),
    term: stringField(record, "term"),
    createdAt: numberField(record, "createdAt"),
  };
}

export function replacementRuleFromRow(row: unknown): ReplacementRule {
  const record = asRecord(row) ?? {};
  return {
    id: stringField(record, "_id"),
    source: stringField(record, "source"),
    destination: stringField(record, "destination"),
    createdAt: numberField(record, "createdAt"),
  };
}

export function userSnippetFromRow(row: unknown): UserSnippet {
  const record = asRecord(row) ?? {};
  return {
    id: stringField(record, "_id"),
    trigger: stringField(record, "trigger"),
    expansion: stringField(record, "expansion"),
    createdAt: numberField(record, "createdAt"),
  };
}

export function dictationSettingsFromRow(row: unknown): DictationSettingsDoc | null {
  const record = asRecord(row);
  if (!record) return null;
  return {
    id: stringField(record, "_id"),
    data: record.data,
    version: numberField(record, "version"),
    updatedAt: numberField(record, "updatedAt"),
  };
}
