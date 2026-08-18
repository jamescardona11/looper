import {
  useDictationDictionary,
  useDictationHistory,
  useDictationReplacements,
  useDictationSettings,
  useNotes,
} from "@looper/data";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/shared/theme/colors";
import { type MobileImportBundle, parseMobileImport } from "./import-logic";

type ImportSection = "dictionary" | "replacements" | "styles" | "transcripts";

export function ImportScreen() {
  const router = useRouter();
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const settings = useDictationSettings();
  const notes = useNotes({ loadList: false });
  const history = useDictationHistory({ loadList: false });
  const [bundle, setBundle] = useState<MobileImportBundle | null>(null);
  const [selected, setSelected] = useState<Set<ImportSection>>(
    new Set(["dictionary", "replacements", "styles", "transcripts"]),
  );
  const [phase, setPhase] = useState<"idle" | "reading" | "importing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    setPhase("reading");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setPhase("idle");
        return;
      }
      const asset = result.assets[0];
      if (!asset) throw new Error("No se pudo leer el archivo seleccionado.");
      const raw = await new File(asset.uri).text();
      setBundle(parseMobileImport(asset.name, raw));
      setPhase("idle");
    } catch (cause) {
      setPhase("idle");
      setError(cause instanceof Error ? cause.message : "No se pudo abrir la exportación.");
    }
  };

  const apply = async () => {
    if (!bundle) return;
    setError(null);
    setPhase("importing");
    try {
      if (selected.has("dictionary")) {
        const existing = new Set(dictionary.entries.map((entry) => entry.term.toLocaleLowerCase()));
        const missing = bundle.dictionary.filter((term) => {
          const normalized = term.toLocaleLowerCase();
          if (existing.has(normalized)) return false;
          existing.add(normalized);
          return true;
        });
        await Promise.all(missing.map((term) => dictionary.add(term)));
      }
      if (selected.has("replacements")) {
        const existing = new Set(replacements.rules.map((rule) => rule.source.toLocaleLowerCase()));
        const missing = bundle.replacements.filter((rule) => {
          const normalized = rule.source.toLocaleLowerCase();
          if (existing.has(normalized)) return false;
          existing.add(normalized);
          return true;
        });
        await Promise.all(missing.map((rule) => replacements.add(rule.source, rule.destination)));
      }
      if (selected.has("styles") && bundle.styles.length > 0) {
        await settings.update(mergeImportedStudioSettings(settings.doc?.data, bundle));
      }
      if (selected.has("transcripts")) {
        await Promise.all(
          bundle.transcripts.map(async (transcript) => {
            const noteId = await notes.create({
              title: titleFromTranscript(transcript.text),
              body: transcript.text,
              kind: "dictation",
            });
            await history.record({
              text: transcript.text,
              sourceId: `import:${noteId}`,
              occurredAt: transcript.occurredAt,
            });
          }),
        );
      }
      setPhase("done");
    } catch (cause) {
      setPhase("idle");
      setError(cause instanceof Error ? cause.message : "La importación quedó incompleta.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Importar</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "done" ? (
          <View style={styles.done}>
            <Text style={styles.doneTitle}>Importación terminada</Text>
            <Text style={styles.body}>
              El contenido ya está disponible en Library, Studio y Ask.
            </Text>
            <Pressable onPress={() => router.replace("/")} style={styles.primary}>
              <Text style={styles.primaryText}>Abrir Library</Text>
            </Pressable>
          </View>
        ) : bundle ? (
          <View style={styles.preview}>
            <Text style={styles.eyebrow}>VISTA PREVIA · {bundle.source}</Text>
            <Text style={styles.previewTitle}>Elige qué traer a Looper</Text>
            <ImportChoice
              count={bundle.dictionary.length}
              id="dictionary"
              label="Diccionario"
              selected={selected}
              setSelected={setSelected}
            />
            <ImportChoice
              count={bundle.replacements.length}
              id="replacements"
              label="Reemplazos"
              selected={selected}
              setSelected={setSelected}
            />
            <ImportChoice
              count={bundle.styles.length}
              id="styles"
              label="Estilos"
              selected={selected}
              setSelected={setSelected}
            />
            <ImportChoice
              count={bundle.transcripts.length}
              id="transcripts"
              label="Historial de dictados"
              selected={selected}
              setSelected={setSelected}
            />
            <Text style={styles.privacy}>
              Solo se importa texto. Looper no copia audio ni accede a la base privada de otra app.
            </Text>
            <Pressable
              disabled={phase === "importing"}
              onPress={() => void apply()}
              style={styles.primary}
            >
              {phase === "importing" ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryText}>Importar selección</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setBundle(null)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Elegir otro archivo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>DESDE OTRAS APPS</Text>
            <Text style={styles.heroTitle}>Tu contexto no empieza de cero.</Text>
            <Text style={styles.body}>
              Selecciona una exportación JSON, Markdown o texto de superwhisper, Aqua u otra app.
            </Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Compatible ahora</Text>
              <Text style={styles.body}>
                Diccionario · reemplazos · estilos · historial de texto
              </Text>
            </View>
            <Pressable
              disabled={phase === "reading"}
              onPress={() => void pick()}
              style={styles.primary}
            >
              {phase === "reading" ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryText}>Elegir archivo</Text>
              )}
            </Pressable>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ImportChoice({
  id,
  label,
  count,
  selected,
  setSelected,
}: {
  id: ImportSection;
  label: string;
  count: number;
  selected: Set<ImportSection>;
  setSelected: (next: Set<ImportSection>) => void;
}) {
  const checked = selected.has(id);
  const toggle = () => {
    const next = new Set(selected);
    if (checked) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: count === 0 }}
      disabled={count === 0}
      onPress={toggle}
      style={[styles.choice, count === 0 && styles.disabled]}
    >
      <View style={[styles.check, checked && styles.checked]}>
        <Text style={styles.checkText}>{checked ? "✓" : ""}</Text>
      </View>
      <Text style={styles.choiceLabel}>{label}</Text>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

function mergeImportedStudioSettings(
  current: unknown,
  bundle: MobileImportBundle,
): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  const previous = Array.isArray(base.styles) ? base.styles : [];
  return {
    ...base,
    styles: [...previous, ...bundle.styles],
    ...(bundle.language ? { language: bundle.language } : {}),
  };
}

function titleFromTranscript(value: string): string {
  const title = value.trim().split(/\s+/).slice(0, 8).join(" ");
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 12,
  },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  backText: { color: colors.textSecondary, fontSize: 30 },
  title: { color: colors.text, flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  content: { flexGrow: 1, padding: 20 },
  hero: { gap: 18, paddingTop: 28 },
  preview: { gap: 11 },
  done: { gap: 16, justifyContent: "center", minHeight: 520 },
  eyebrow: { color: colors.accentLight, fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  heroTitle: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "700",
    letterSpacing: -0.9,
    lineHeight: 36,
  },
  previewTitle: { color: colors.text, fontSize: 23, fontWeight: "700", marginBottom: 8 },
  doneTitle: { color: colors.text, fontSize: 26, fontWeight: "700" },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  infoCard: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    gap: 7,
    padding: 15,
  },
  infoTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  choice: {
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 54,
    paddingHorizontal: 13,
  },
  check: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  choiceLabel: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700" },
  count: { color: colors.muted, fontSize: 13 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingVertical: 6 },
  primary: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 50,
    marginTop: 8,
  },
  primaryText: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger, lineHeight: 20, marginTop: 16 },
});
