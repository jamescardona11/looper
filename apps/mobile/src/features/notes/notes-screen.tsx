import { type Note, useNotes } from "@looper/data";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/shared/components/button";
import { Icon } from "@/shared/components/icon";
import { EmptyState } from "@/shared/components/screen-states";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { sortNotesByUpdatedAt } from "./local-notes-logic";
import { hasUnsavedNoteChanges, persistedNoteTitle } from "./note-editor-logic";

type SaveState = "saved" | "saving" | "error";

/**
 * La lista vive en Library; aquí se abre una nota. `?id=` elige cuál y, sin
 * parámetro, se abre la última tocada.
 */
export function NotesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { notes, isLoading, create, update, remove } = useNotes();
  const [openedId, setOpenedId] = useState<string | null>(null);

  const ordered = useMemo(() => sortNotesByUpdatedAt(notes), [notes]);
  const wantedId = openedId ?? params.id ?? null;
  const note = useMemo(
    () => ordered.find((item) => item.id === wantedId) ?? ordered[0] ?? null,
    [ordered, wantedId],
  );

  const createNote = async () => {
    try {
      setOpenedId(await create({ title: "", body: "" }));
    } catch {
      Alert.alert("No se pudo crear la nota", "Revisa la conexión e inténtalo de nuevo.");
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await remove(id);
      setOpenedId(null);
    } catch {
      Alert.alert("No se pudo eliminar la nota", "Revisa la conexión e inténtalo de nuevo.");
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert("Eliminar nota", "Esta nota se borrará de forma permanente.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => void deleteNote(id) },
    ]);
  };

  if (!note) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <EditorHeader
          onBack={() => goBack(router)}
          onMenu={() => void createNote()}
          saveState="saved"
        />
        <View style={styles.blank}>
          {isLoading ? (
            <EditorSkeleton />
          ) : (
            <EmptyState
              action={
                <Button
                  label="Escribir la primera nota"
                  onPress={() => void createNote()}
                  variant="primary"
                />
              }
              body="Una nota es el sitio de una idea suelta, antes de convertirla en reunión."
              title="Aquí no hay nada escrito"
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <NoteEditor
      key={note.id}
      note={note}
      onBack={() => goBack(router)}
      onDelete={() => confirmDelete(note.id)}
      onDictate={() => router.push("/dictation" as Href)}
      onNew={() => void createNote()}
      onSave={update}
    />
  );
}

type NoteEditorProps = {
  note: Note;
  onSave: (input: { id: string; title: string; body: string }) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
  onNew: () => void;
  onDictate: () => void;
};

function NoteEditor({ note, onSave, onBack, onDelete, onNew, onDictate }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [caret, setCaret] = useState({ end: 0, start: 0 });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [retryCount, setRetryCount] = useState(0);
  const requestNumber = useRef(0);
  const isDirty = hasUnsavedNoteChanges({
    draftTitle: title,
    draftBody: body,
    savedTitle: note.title,
    savedBody: note.body,
  });

  // retryCount intentionally restarts the autosave effect after a failed save.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a deliberate retrigger
  useEffect(() => {
    if (!isDirty) {
      setSaveState("saved");
      return;
    }

    const requestId = ++requestNumber.current;
    const timer = setTimeout(() => {
      setSaveState("saving");
      void onSave({ id: note.id, title: persistedNoteTitle(title), body })
        .then(() => {
          if (requestId === requestNumber.current) setSaveState("saved");
        })
        .catch(() => {
          if (requestId === requestNumber.current) setSaveState("error");
        });
    }, 700);

    return () => clearTimeout(timer);
  }, [body, isDirty, note.id, onSave, retryCount, title]);

  const openMenu = () => {
    Alert.alert("Nota", undefined, [
      { text: "Nueva nota", onPress: onNew },
      { text: "Eliminar nota", style: "destructive", onPress: onDelete },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <EditorHeader onBack={onBack} onMenu={openMenu} saveState={saveState} />
        {saveState === "error" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetryCount((count) => count + 1)}
            style={styles.saveFailure}
          >
            <Icon color={colors.danger} name="warning" size={16} />
            <Text style={styles.saveFailureText}>
              No se pudo guardar. Lo escrito sigue aquí; toca para reintentar.
            </Text>
          </Pressable>
        ) : null}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            multiline
            onChangeText={setTitle}
            placeholder="Título"
            placeholderTextColor={colors.disabled}
            selectTextOnFocus={note.title === "Untitled note"}
            style={styles.title}
            value={title}
          />
          <Text style={styles.meta}>{noteMeta(note.updatedAt, body)}</Text>
          <TextInput
            multiline
            onChangeText={setBody}
            onSelectionChange={(event) => setCaret(event.nativeEvent.selection)}
            placeholder="Empieza a escribir o usa Dictar."
            placeholderTextColor={colors.disabled}
            style={styles.bodyInput}
            textAlignVertical="top"
            value={body}
          />
        </ScrollView>
        <View style={styles.accessories}>
          <AccessoryButton
            label="Negrita"
            onPress={() => setBody(wrapSelection(body, caret, "**"))}
            paths={GLYPHS.bold}
          />
          <AccessoryButton
            label="Lista"
            onPress={() => setBody(prefixLine(body, caret.start, "- "))}
            paths={GLYPHS.list}
          />
          <AccessoryButton
            label="Encabezado"
            onPress={() => setBody(prefixLine(body, caret.start, "## "))}
            paths={GLYPHS.heading}
          />
          <View style={styles.fill} />
          <Pressable
            accessibilityLabel="Dictar"
            accessibilityRole="button"
            onPress={onDictate}
            style={({ pressed }) => [styles.accessory, styles.dictate, pressed && styles.pressed]}
          >
            <Icon color={colors.accent} name="mic" size={19} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EditorHeader({
  saveState,
  onBack,
  onMenu,
}: {
  saveState: SaveState;
  onBack: () => void;
  onMenu: () => void;
}) {
  const statusText =
    saveState === "saving" ? "Guardando…" : saveState === "error" ? "Sin guardar" : "Guardado";

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Volver"
        accessibilityRole="button"
        onPress={onBack}
        style={styles.headerButton}
      >
        <Icon color={colors.textSecondary} name="chevronLeft" size={22} strokeWidth={2.2} />
      </Pressable>
      <View accessibilityLiveRegion="polite" style={styles.saveStatus}>
        {saveState === "saved" ? <Icon color={colors.muted} name="check" size={13} /> : null}
        {saveState === "error" ? <Icon color={colors.danger} name="warning" size={13} /> : null}
        <Text style={[styles.saveStatusText, saveState === "error" && styles.saveStatusError]}>
          {statusText}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Más opciones"
        accessibilityRole="button"
        onPress={onMenu}
        style={styles.headerButton}
      >
        <Icon color={colors.textSecondary} name="more" size={20} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function AccessoryButton({
  label,
  paths,
  onPress,
}: {
  label: string;
  paths: readonly string[];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.accessory, pressed && styles.pressed]}
    >
      <Svg fill="none" height={19} viewBox="0 0 24 24" width={19}>
        {paths.map((d) => (
          <Path
            d={d}
            key={d}
            stroke={colors.textSecondary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ))}
      </Svg>
    </Pressable>
  );
}

/** Esqueleto con la forma del editor: un título y tres líneas de cuerpo. */
function EditorSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.skeleton}
    >
      <View style={styles.skeletonTitle} />
      {["one", "two", "three"].map((line) => (
        <View key={line} style={styles.skeletonLine} />
      ))}
    </View>
  );
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/" as Href);
}

function wrapSelection(
  text: string,
  caret: { start: number; end: number },
  marker: string,
): string {
  const head = text.slice(0, caret.start);
  const tail = text.slice(caret.end);
  return `${head}${marker}${text.slice(caret.start, caret.end)}${marker}${tail}`;
}

function prefixLine(text: string, caret: number, marker: string): string {
  const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  if (text.startsWith(marker, lineStart)) return text;
  return `${text.slice(0, lineStart)}${marker}${text.slice(lineStart)}`;
}

const timeFormatter = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function noteMeta(updatedAt: number, body: string): string {
  const when = new Date(updatedAt);
  const stamp =
    new Date().toDateString() === when.toDateString()
      ? `Hoy ${timeFormatter.format(when)}`
      : `${dateFormatter.format(when)} ${timeFormatter.format(when)}`;
  const paragraphs = body.split(/\n{2,}/).filter((block) => block.trim().length > 0).length;
  if (paragraphs === 0) return `${stamp} · sin texto`;
  return `${stamp} · ${paragraphs} ${paragraphs === 1 ? "párrafo" : "párrafos"}`;
}

/** Trazos del artboard que todavía no están en ICON_PATHS. */
const GLYPHS = {
  bold: ["M6 4h8a4 4 0 0 1 0 8H6Z", "M6 12h9a4 4 0 0 1 0 8H6Z"],
  heading: ["M4 6h16", "M4 11h16", "M4 16h9"],
  list: ["M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01", "M4.5 12h.01", "M4.5 18h.01"],
} as const;

const ACCESSORY_BAR_HEIGHT = 56;

const styles = StyleSheet.create({
  accessories: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: ACCESSORY_BAR_HEIGHT,
    paddingHorizontal: space.md,
  },
  accessory: {
    alignItems: "center",
    borderRadius: radius.md,
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  blank: { flex: 1, paddingHorizontal: space.xl },
  bodyInput: {
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 27,
    minHeight: 320,
    padding: 0,
  },
  content: { gap: space.lg, paddingBottom: space.xxl, paddingHorizontal: space.xl, paddingTop: 6 },
  dictate: { backgroundColor: colors.accentSubtle },
  fill: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  headerButton: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  meta: { ...typography.meta, color: colors.muted, marginTop: -space.sm },
  pressed: { backgroundColor: colors.surface },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  saveFailure: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.sm,
    paddingBottom: space.sm,
    paddingHorizontal: space.xl,
  },
  saveFailureText: { ...typography.meta, color: colors.danger, flex: 1 },
  saveStatus: { alignItems: "center", flexDirection: "row", gap: 6 },
  saveStatusError: { color: colors.danger },
  saveStatusText: { ...typography.meta, color: colors.muted },
  skeleton: { gap: space.md, paddingTop: space.md },
  skeletonLine: { backgroundColor: colors.surfaceMuted, borderRadius: radius.xs, height: 14 },
  skeletonTitle: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: 30,
    marginBottom: space.sm,
    width: "70%",
  },
  title: { ...typography.display, color: colors.text, padding: 0 },
});
