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
import { Button } from "@/shared/components/button";
import { Chip } from "@/shared/components/chip";
import { Icon } from "@/shared/components/icon";
import { ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { type MobileImportBundle, parseMobileImport } from "./import-logic";

type ImportSection = "dictionary" | "replacements" | "styles" | "transcripts";
type PickedFile = { name: string; size: number | null };

const SECTIONS: { id: ImportSection; title: string; note: string }[] = [
  {
    id: "dictionary",
    note: "Términos que el dictado no debe corregir",
    title: "Diccionario",
  },
  {
    id: "replacements",
    note: "Sustituciones que se aplican al escribir",
    title: "Reemplazos",
  },
  {
    id: "styles",
    note: "Entran como copia y los eliges en Studio",
    title: "Estilos",
  },
  {
    id: "transcripts",
    note: "Se guardan como notas dictadas en Library",
    title: "Transcripciones",
  },
];

/** Lo que `parseMobileImport` sabe leer hoy. */
const KNOWN_SOURCES = ["superwhisper", "Aqua Voice", "Otra app (JSON)", "Texto plano"];

/**
 * Dos pasos: elegir el archivo y revisar qué entra. La revisión es la parte que
 * importa — nadie debe pulsar «Importar» sin ver el recuento por tipo.
 */
export function ImportScreen() {
  const router = useRouter();
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const settings = useDictationSettings();
  const notes = useNotes({ loadList: false });
  const history = useDictationHistory({ loadList: false });
  const [file, setFile] = useState<PickedFile | null>(null);
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
      setFile({ name: asset.name, size: asset.size ?? null });
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

  const counts = bundle ? countsOf(bundle) : null;
  const total = counts
    ? SECTIONS.reduce(
        (sum, section) => sum + (selected.has(section.id) ? counts[section.id] : 0),
        0,
      )
    : 0;

  const toggle = (id: ImportSection) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Icon color={colors.textSecondary} name="chevronLeft" size={22} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>Importar</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <ErrorState
            body={
              bundle
                ? "Lo que ya se guardó se queda en Looper. Puedes reintentar el resto sin duplicar nada."
                : "Elige otro archivo o vuelve a intentarlo: no se ha cambiado nada."
            }
            detail={error}
            onRetry={() => (bundle ? void apply() : void pick())}
            title={bundle ? "La importación quedó incompleta" : "No se pudo abrir la exportación"}
          />
        ) : null}

        {phase === "done" ? (
          <View style={styles.done}>
            <Text style={styles.title}>Ya está todo dentro</Text>
            <Text style={styles.lede}>
              El contenido está disponible en Library, Studio y Ask. Nada de lo que ya tenías se ha
              sobrescrito.
            </Text>
          </View>
        ) : bundle && counts ? (
          <>
            <FileCard file={file} source={bundle.source} />
            <View style={styles.list}>
              <SectionLabel>Qué se va a importar</SectionLabel>
              {SECTIONS.map((section) => (
                <SectionRow
                  checked={selected.has(section.id)}
                  count={counts[section.id]}
                  key={section.id}
                  note={section.note}
                  onToggle={() => toggle(section.id)}
                  title={section.title}
                />
              ))}
            </View>
            <View style={styles.note}>
              <Icon color={colors.muted} name="warning" size={16} />
              <Text style={styles.noteText}>
                Nada se sobrescribe. Los estilos con el mismo nombre entran como copia y los eliges
                tú en Studio.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={styles.title}>Trae lo que ya tenías</Text>
              <Text style={styles.lede}>
                Elige el archivo de exportación de tu dictador anterior. Looper lee su diccionario,
                sus reemplazos, sus estilos y sus transcripciones.
              </Text>
            </View>
            <Pressable
              accessibilityHint=".json exportado, o texto plano"
              accessibilityLabel="Elegir archivo"
              accessibilityRole="button"
              disabled={phase === "reading"}
              onPress={() => void pick()}
              style={({ pressed }) => [styles.dropZone, pressed && styles.dimmed]}
            >
              {phase === "reading" ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <View style={styles.dropTile}>
                    <Icon color={colors.textSecondary} name="import" size={24} strokeWidth={1.9} />
                  </View>
                  <View style={styles.dropCopy}>
                    <Text style={styles.rowTitle}>Elegir archivo</Text>
                    <Text style={styles.dropHint}>.json exportado, o texto plano</Text>
                  </View>
                </>
              )}
            </Pressable>
            <View style={styles.sources}>
              <SectionLabel>Reconoce exportaciones de</SectionLabel>
              <View style={styles.chips}>
                {KNOWN_SOURCES.map((name) => (
                  <Chip key={name} label={name} />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {phase === "done" ? (
        <View style={styles.footer}>
          <Button label="Abrir Library" onPress={() => router.replace("/")} variant="primary" />
        </View>
      ) : bundle ? (
        <View style={styles.footer}>
          <Button
            label="Elegir otro archivo"
            onPress={() => {
              setBundle(null);
              setFile(null);
              setError(null);
            }}
            variant="ghost"
          />
          <Button
            disabled={total === 0 || phase === "importing"}
            label={importLabel(total, phase === "importing")}
            onPress={() => void apply()}
            variant="primary"
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function FileCard({ file, source }: { file: PickedFile | null; source: string }) {
  const meta = [source === file?.name ? null : source, formatSize(file?.size ?? null)]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.fileCard}>
      <View style={styles.fileTile}>
        <Icon color={colors.accent} name="nota" size={18} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {file?.name ?? source}
        </Text>
        {meta ? <Text style={styles.rowNote}>{meta}</Text> : null}
      </View>
    </View>
  );
}

function SectionRow({
  checked,
  count,
  note,
  onToggle,
  title,
}: {
  checked: boolean;
  count: number;
  note: string;
  onToggle: () => void;
  title: string;
}) {
  const empty = count === 0;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: checked && !empty, disabled: empty }}
      disabled={empty}
      onPress={onToggle}
      style={({ pressed }) => [styles.sectionRow, empty && styles.dimmed, pressed && styles.dimmed]}
    >
      <View style={[styles.checkbox, checked && !empty && styles.checkboxOn]}>
        {checked && !empty ? (
          <Icon color={colors.onAccent} name="check" size={12} strokeWidth={3.2} />
        ) : null}
      </View>
      <Text style={styles.count}>{count}</Text>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowNote}>{empty ? "El archivo no trae nada de esto" : note}</Text>
      </View>
    </Pressable>
  );
}

function countsOf(bundle: MobileImportBundle): Record<ImportSection, number> {
  return {
    dictionary: bundle.dictionary.length,
    replacements: bundle.replacements.length,
    styles: bundle.styles.length,
    transcripts: bundle.transcripts.length,
  };
}

function importLabel(total: number, running: boolean): string {
  if (running) return "Importando…";
  if (total === 0) return "Nada seleccionado";
  return total === 1 ? "Importar 1 elemento" : `Importar ${total} elementos`;
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
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

const SCREEN_PAD = 20;

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  content: { gap: 22, paddingBottom: space.xxl, paddingHorizontal: SCREEN_PAD, paddingTop: 6 },
  count: {
    ...typography.item,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    width: 34,
  },
  dimmed: { opacity: 0.5 },
  done: { gap: 10, paddingTop: space.xxl },
  dropCopy: { alignItems: "center", gap: space.xs },
  dropHint: { ...typography.meta, color: colors.disabled },
  dropTile: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  dropZone: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 14,
    justifyContent: "center",
    minHeight: 200,
  },
  fileCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    padding: space.lg,
  },
  fileTile: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  footer: { gap: space.sm, paddingHorizontal: SCREEN_PAD, paddingVertical: 14 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 6,
  },
  headerTitle: { ...typography.item, color: colors.textSecondary },
  intro: { gap: 10 },
  lede: { ...typography.body, color: colors.muted, lineHeight: 23 },
  list: { gap: 10 },
  note: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: space.lg,
  },
  noteText: { ...typography.meta, color: colors.muted, flex: 1, lineHeight: 20 },
  rowCopy: { flex: 1, gap: 2 },
  rowNote: { ...typography.meta, color: colors.muted, lineHeight: 19 },
  rowTitle: { ...typography.item, color: colors.text },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  sectionRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  sources: { gap: space.sm },
  title: { ...typography.title, color: colors.text },
});
