import { api } from "@looper/backend/convex/_generated/api";
import type { Id } from "@looper/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type { Note } from "../../../types";

type NoteRow = {
  _id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  kind?: "note" | "dictation";
};

function noteFromRow(row: NoteRow): Note {
  return {
    id: row._id,
    kind: row.kind ?? "note",
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function useNotes({ loadList = true }: { loadList?: boolean } = {}): {
  notes: Note[];
  isLoading: boolean;
  create: (input: { title: string; body: string; kind?: "note" | "dictation" }) => Promise<string>;
  upsertFromDevice: (input: Note & { sourceId: string }) => Promise<string>;
  update: (input: { id: string; title: string; body: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const rows = useQuery(api.notes.notes.list, loadList ? {} : "skip");
  const createMutation = useMutation(api.notes.notes.create);
  const updateMutation = useMutation(api.notes.notes.update);
  const removeMutation = useMutation(api.notes.notes.remove);

  const create = useCallback(
    async (input: { title: string; body: string; kind?: "note" | "dictation" }) =>
      String(await createMutation(input)),
    [createMutation],
  );
  const upsertMutation = useMutation(api.notes.notes.upsertFromDevice);
  const upsertFromDevice = useCallback(
    async ({ sourceId, kind, title, body, createdAt, updatedAt }: Note & { sourceId: string }) =>
      String(
        await upsertMutation({
          sourceId,
          kind: kind ?? "note",
          title,
          body,
          createdAt,
          updatedAt,
        }),
      ),
    [upsertMutation],
  );
  const update = useCallback(
    async ({ id, title, body }: { id: string; title: string; body: string }) => {
      await updateMutation({ id: id as Id<"notes">, title, body });
    },
    [updateMutation],
  );
  const remove = useCallback(
    async (id: string) => {
      await removeMutation({ id: id as Id<"notes"> });
    },
    [removeMutation],
  );

  return {
    notes: Array.isArray(rows) ? (rows as NoteRow[]).map(noteFromRow) : [],
    isLoading: loadList && rows === undefined,
    create,
    upsertFromDevice,
    update,
    remove,
  };
}
