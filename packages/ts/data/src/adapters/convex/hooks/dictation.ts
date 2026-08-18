import { api } from "@looper/backend/convex/_generated/api";
import type { Id } from "@looper/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type {
  DictationSettingsDoc,
  DictionaryEntry,
  ReplacementRule,
  UserSnippet,
  DictationHistoryItem,
} from "../../../types";
import {
  dictationSettingsFromRow,
  dictionaryEntryFromRow,
  replacementRuleFromRow,
  userSnippetFromRow,
} from "../dictation-mappers";

export function useDictationHistory({ loadList = true }: { loadList?: boolean } = {}): {
  items: DictationHistoryItem[];
  isLoading: boolean;
  record: (input: {
    text: string;
    source?: "local" | "remote";
    sourceId?: string;
    occurredAt?: number;
  }) => Promise<string>;
} {
  const rows = useQuery(api.dictation.transcriptions.list, loadList ? {} : "skip");
  const recordMutation = useMutation(api.dictation.transcriptions.record);
  const record = useCallback(
    async ({
      text,
      source = "local",
      sourceId,
      occurredAt,
    }: {
      text: string;
      source?: "local" | "remote";
      sourceId?: string;
      occurredAt?: number;
    }) =>
      String(
        await recordMutation({
          text,
          source,
          ...(sourceId !== undefined ? { sourceId } : {}),
          ...(occurredAt !== undefined ? { occurredAt } : {}),
        }),
      ),
    [recordMutation],
  );
  return {
    items: Array.isArray(rows)
      ? rows.map((row) => ({
          id: String(row._id),
          text: row.text,
          source: row.source,
          sourceId: row.sourceId ?? null,
          occurredAt: row.occurredAt ?? row.createdAt,
          createdAt: row.createdAt,
        }))
      : [],
    isLoading: loadList && rows === undefined,
    record,
  };
}

export function useDictationDictionary(): {
  entries: DictionaryEntry[];
  isLoading: boolean;
  add: (term: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
} {
  const rows = useQuery(api.dictation.dictionary.list, {});
  const addMutation = useMutation(api.dictation.dictionary.add);
  const removeMutation = useMutation(api.dictation.dictionary.remove);

  const add = useCallback(
    async (term: string) => {
      const id = await addMutation({ term });
      return String(id);
    },
    [addMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeMutation({ id: id as Id<"dictionaryEntries"> });
    },
    [removeMutation],
  );

  return {
    entries: Array.isArray(rows) ? rows.map(dictionaryEntryFromRow) : [],
    isLoading: rows === undefined,
    add,
    remove,
  };
}

export function useDictationReplacements(): {
  rules: ReplacementRule[];
  isLoading: boolean;
  add: (source: string, destination: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
} {
  const rows = useQuery(api.dictation.replacements.list, {});
  const addMutation = useMutation(api.dictation.replacements.add);
  const removeMutation = useMutation(api.dictation.replacements.remove);

  const add = useCallback(
    async (source: string, destination: string) => {
      const id = await addMutation({ source, destination });
      return String(id);
    },
    [addMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeMutation({ id: id as Id<"replacements"> });
    },
    [removeMutation],
  );

  return {
    rules: Array.isArray(rows) ? rows.map(replacementRuleFromRow) : [],
    isLoading: rows === undefined,
    add,
    remove,
  };
}

export function useDictationSnippets(): {
  snippets: UserSnippet[];
  isLoading: boolean;
  add: (trigger: string, expansion: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
} {
  const rows = useQuery(api.dictation.snippets.list, {});
  const addMutation = useMutation(api.dictation.snippets.add);
  const removeMutation = useMutation(api.dictation.snippets.remove);

  const add = useCallback(
    async (trigger: string, expansion: string) => {
      const id = await addMutation({ trigger, expansion });
      return String(id);
    },
    [addMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeMutation({ id: id as Id<"snippets"> });
    },
    [removeMutation],
  );

  return {
    snippets: Array.isArray(rows) ? rows.map(userSnippetFromRow) : [],
    isLoading: rows === undefined,
    add,
    remove,
  };
}

export function useDictationSettings(): {
  doc: DictationSettingsDoc | null;
  isLoading: boolean;
  update: (data: unknown) => Promise<string>;
} {
  const row = useQuery(api.dictation.settings.get, {});
  const updateMutation = useMutation(api.dictation.settings.update);

  const update = useCallback(
    async (data: unknown) => {
      const id = await updateMutation({ data });
      return String(id);
    },
    [updateMutation],
  );

  return {
    doc: row === undefined ? null : dictationSettingsFromRow(row),
    isLoading: row === undefined,
    update,
  };
}
