import { type Note, useNotes } from "@looper/data";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, Screen } from "@/shared/components/screen";
import { hasUnsavedNoteChanges, persistedNoteTitle } from "./note-editor-logic";

export function NotesScreen() {
  const { notes, isLoading, create, update, remove } = useNotes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? notes[0] ?? null,
    [notes, selectedId],
  );

  const createNote = async () => {
    try {
      const id = await create({ title: "", body: "" });
      setSelectedId(id);
    } catch {
      Alert.alert("No se pudo crear la nota", "Revisa la conexión e inténtalo de nuevo.");
    }
  };

  return (
    <Screen
      title="Notas"
      action={
        <Pressable
          accessibilityLabel="Crear nota"
          accessibilityRole="button"
          onPress={() => void createNote()}
          style={styles.newButton}
        >
          <Text style={styles.newButtonText}>Nueva</Text>
        </Pressable>
      }
    >
      <Text style={styles.description}>
        Un lugar para capturar una idea sin convertirla primero en una reunión.
      </Text>
      <Text style={styles.storageHint}>Sincronizado de forma privada con tu Library.</Text>
      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      <View style={styles.workspace}>
        <View style={styles.list}>
          {notes.map((note) => (
            <NoteListItem
              isSelected={selected?.id === note.id}
              key={note.id}
              note={note}
              onPress={() => setSelectedId(note.id)}
            />
          ))}
          {!isLoading && notes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.empty}>Crea la primera nota para empezar.</Text>
              <Pressable
                accessibilityLabel="Crear primera nota"
                accessibilityRole="button"
                onPress={() => void createNote()}
                style={styles.emptyButton}
              >
                <Text style={styles.emptyButtonText}>Crear primera nota</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onDelete={async (id) => {
              await remove(id);
              setSelectedId(null);
            }}
            onSave={update}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function NoteListItem({
  note,
  isSelected,
  onPress,
}: {
  note: Note;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.noteItem, isSelected && styles.selectedNote]}>
      <Text numberOfLines={1} style={styles.noteTitle}>
        {note.title}
      </Text>
      <Text numberOfLines={2} style={styles.notePreview}>
        {note.body || "Nota vacía"}
      </Text>
    </Pressable>
  );
}

function NoteEditor({
  note,
  onSave,
  onDelete,
}: {
  note: Note;
  onSave: (input: { id: string; title: string; body: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestNumber = useRef(0);
  const isDirty = hasUnsavedNoteChanges({
    draftTitle: title,
    draftBody: body,
    savedTitle: note.title,
    savedBody: note.body,
  });

  useEffect(() => {
    if (!isDirty) {
      setSaveState("saved");
      setSaveError(null);
      return;
    }

    const requestId = ++requestNumber.current;
    const timer = setTimeout(() => {
      setSaveState("saving");
      setSaveError(null);
      void onSave({ id: note.id, title: persistedNoteTitle(title), body })
        .then(() => {
          if (requestId === requestNumber.current) setSaveState("saved");
        })
        .catch(() => {
          if (requestId === requestNumber.current) {
            setSaveState("error");
            setSaveError("No se pudo guardar. Revisa la conexión e inténtalo de nuevo.");
          }
        });
    }, 700);

    return () => clearTimeout(timer);
  }, [body, isDirty, note.id, onSave, retryCount, title]);

  const confirmDelete = () => {
    Alert.alert("Eliminar nota", "Esta nota se borrará de forma permanente.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => void onDelete(note.id) },
    ]);
  };

  return (
    <View style={styles.editor}>
      <TextInput
        onChangeText={setTitle}
        placeholder="Título"
        placeholderTextColor={colors.muted}
        selectTextOnFocus={note.title === "Untitled note"}
        style={styles.editorTitle}
        value={title}
      />
      <TextInput
        multiline
        onChangeText={setBody}
        placeholder="Empieza a escribir o usa Dictar."
        placeholderTextColor={colors.muted}
        style={styles.editorBody}
        textAlignVertical="top"
        value={body}
      />
      <View style={styles.editorActions}>
        <Pressable onPress={confirmDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Eliminar</Text>
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.saveStatus, saveState === "error" && styles.saveError]}
        >
          {saveState === "saving" ? "Guardando…" : saveState === "error" ? "Error al guardar" : "Guardado"}
        </Text>
      </View>
      {saveError ? (
        <View style={styles.saveFailure}>
          <Text style={styles.saveError}>{saveError}</Text>
          <Pressable onPress={() => setRetryCount((count) => count + 1)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
  storageHint: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  newButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newButtonText: { color: colors.onAccent, fontWeight: "700" },
  workspace: { gap: 12 },
  list: { gap: 8 },
  noteItem: { backgroundColor: colors.surface, borderRadius: 12, gap: 4, padding: 14 },
  selectedNote: { borderColor: colors.accent, borderWidth: 1 },
  noteTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  notePreview: { color: colors.textSecondary, lineHeight: 19 },
  emptyState: { alignItems: "center", gap: 12, paddingVertical: 24 },
  empty: { color: colors.muted, textAlign: "center" },
  emptyButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyButtonText: { color: colors.text, fontWeight: "700" },
  editor: { backgroundColor: colors.surface, borderRadius: 16, gap: 14, padding: 16 },
  editorTitle: { color: colors.text, fontSize: 22, fontWeight: "700", padding: 0 },
  editorBody: { color: colors.text, fontSize: 16, lineHeight: 24, minHeight: 210, padding: 0 },
  editorActions: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: "700" },
  saveStatus: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  saveError: { color: colors.danger, lineHeight: 19 },
  saveFailure: { gap: 6 },
  retryText: { color: colors.accent, fontWeight: "700" },
});
