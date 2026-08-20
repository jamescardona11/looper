import {
  useDictationDictionary,
  useDictationReplacements,
  useDictationSettings,
  useDictationSnippets,
} from "@looper/data";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/components/button";
import { Chip } from "@/shared/components/chip";
import { Icon } from "@/shared/components/icon";
import { EmptyState, ErrorState, SkeletonRow } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { normalizeStudioSettings, type SmartMode } from "@/shared/studio/studio-settings";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import {
  isNativeKeyboardAvailable,
  isNativeKeyboardEnabled,
  openNativeKeyboardSettings,
} from "./native-keyboard";
import { syncKeyboardContent } from "./sync-keyboard-content";

/** Los cinco formatos reales del ajuste (`SmartMode["format"]`), en español. */
const FORMATS: { label: string; value: SmartMode["format"] }[] = [
  { label: "Ninguno", value: "none" },
  { label: "Correo", value: "email" },
  { label: "Mensaje", value: "message" },
  { label: "Bullets", value: "bullets" },
  { label: "Tareas", value: "todo" },
];

/**
 * iOS no expone la lista de teclados activos (`isEnabled` resuelve siempre
 * `false`), así que el único paso que la app puede dar por hecho es el primero:
 * si el puente nativo responde, este build trae la extensión.
 */
const SETUP_STEPS: { done: boolean; text: string }[] = [
  { done: true, text: "Añade Looper en Ajustes › Teclados." },
  { done: false, text: "Actívalo en la lista de teclados." },
  { done: false, text: "Concede acceso completo: sin él no puede dictar." },
];

const FAILURE_COPY: Record<FailureKind, { body: string; title: string }> = {
  settings: {
    body: "Ábrelos a mano en Ajustes › General › Teclado › Teclados.",
    title: "No se pudieron abrir los ajustes",
  },
  sync: {
    body: "Tus términos, reemplazos y snippets siguen guardados en la cuenta. El teclado se queda con la última copia que recibió.",
    title: "No se pudo sincronizar",
  },
};

export function KeyboardScreen() {
  const router = useRouter();
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const snippets = useDictationSnippets();
  const settings = useDictationSettings();
  const studio = useMemo(() => normalizeStudioSettings(settings.doc?.data), [settings.doc?.data]);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [format, setFormat] = useState<SmartMode["format"]>("none");
  const [openList, setOpenList] = useState<ListKind | null>(null);

  const hasBridge = isNativeKeyboardAvailable();

  const refreshStatus = useCallback(() => {
    setEnabled(null);
    void isNativeKeyboardEnabled()
      .then((value) => setEnabled(value))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(refreshStatus, [refreshStatus]);

  const sync = async () => {
    setSyncing(true);
    setFailure(null);
    try {
      const didSync = await syncKeyboardContent({
        entries: dictionary.entries,
        replacements: replacements.rules,
        snippets: snippets.snippets,
        studio,
      });
      if (!didSync) {
        setFailure({ detail: "Falta EXPO_PUBLIC_CONVEX_URL en este build.", kind: "sync" });
        return;
      }
      setSyncedAt(Date.now());
      setEnabled(await isNativeKeyboardEnabled());
    } catch (cause) {
      setFailure({ detail: messageOf(cause), kind: "sync" });
    } finally {
      setSyncing(false);
    }
  };

  const openSettings = () => {
    void openNativeKeyboardSettings()
      .then(() => setFailure(null))
      .catch((cause: unknown) => setFailure({ detail: messageOf(cause), kind: "settings" }));
  };

  const lists = buildLists({ dictionary, replacements, snippets });
  const openSpec = lists.find((list) => list.kind === openList) ?? null;
  const listsLoading = dictionary.isLoading || replacements.isLoading || snippets.isLoading;
  const summary = syncSummary(syncedAt, dictionary.entries.length);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/studio" as Href))}
          style={styles.back}
        >
          <Icon color={colors.textSecondary} name="chevronLeft" size={22} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityLabel="Sincronizar el teclado"
          accessibilityRole="button"
          accessibilityState={{ disabled: syncing }}
          disabled={syncing}
          onPress={() => void sync()}
          style={({ pressed }) => [styles.syncAction, pressed && styles.pressed]}
        >
          <Icon color={colors.accent} name="refresh" size={14} strokeWidth={2.2} />
          <Text style={styles.syncActionText}>{syncing ? "Sincronizando…" : "Sincronizar"}</Text>
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Teclado</Text>
        <Text style={styles.support}>Dicta con tus estilos dentro de cualquier app.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!hasBridge ? (
          <ErrorState
            body="Tus términos, reemplazos y snippets están a salvo en la cuenta. El teclado aparece al abrir un development build de Looper, no Expo Go."
            onRetry={refreshStatus}
            title="Este runtime no trae el teclado"
          />
        ) : failure ? (
          <ErrorState
            body={FAILURE_COPY[failure.kind].body}
            detail={failure.detail}
            onRetry={failure.kind === "sync" ? () => void sync() : openSettings}
            title={FAILURE_COPY[failure.kind].title}
          />
        ) : enabled === null ? (
          <View style={styles.statusCard}>
            <SkeletonRow />
          </View>
        ) : enabled ? (
          <View style={styles.activeCard}>
            <View style={styles.activeBadge}>
              <Icon color={colors.accent} name="check" size={17} strokeWidth={2.8} />
            </View>
            <View style={styles.activeCopy}>
              <Text style={styles.activeTitle}>Activo y con acceso completo</Text>
              <Text accessibilityLiveRegion="polite" style={styles.activeMeta}>
                {summary}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Tres pasos, una sola vez</Text>
            {SETUP_STEPS.map((step, index) => (
              <View key={step.text} style={styles.step}>
                <View style={[styles.stepBadge, step.done && styles.stepBadgeDone]}>
                  <Text style={[styles.stepNumber, step.done && styles.stepNumberDone]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.stepText, step.done && styles.stepTextDone]}>{step.text}</Text>
              </View>
            ))}
            <Button
              icon="chevronRight"
              label="Abrir ajustes del sistema"
              onPress={openSettings}
              variant="primary"
            />
            <Text accessibilityLiveRegion="polite" style={styles.setupMeta}>
              {summary}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <SectionLabel>Formato de salida</SectionLabel>
          <View style={styles.chips}>
            {FORMATS.map((entry) => (
              <Chip
                key={entry.value}
                label={entry.label}
                onPress={() => setFormat(entry.value)}
                selected={format === entry.value}
              />
            ))}
          </View>
          <Text style={styles.sectionNote}>
            El formato ordena lo que dijiste. El estilo, que eliges en Studio, cambia cómo suena.
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>Lo que el teclado sabe</SectionLabel>
          {listsLoading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : (
            lists.map((list) => (
              <KnowledgeRow key={list.kind} onPress={() => setOpenList(list.kind)} spec={list} />
            ))
          )}
        </View>
      </ScrollView>

      <ListSheet onClose={() => setOpenList(null)} spec={openSpec} />
    </SafeAreaView>
  );
}

function KnowledgeRow({ spec, onPress }: { spec: ListSpec; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${spec.title}: ${spec.items.length}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowCount}>{spec.items.length}</Text>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{spec.title}</Text>
        <Text numberOfLines={1} style={styles.rowNote}>
          {spec.note}
        </Text>
      </View>
      <Icon color={colors.muted} name="chevronRight" size={17} strokeWidth={2.2} />
    </Pressable>
  );
}

/** El CRUD de siempre; lo único nuevo es que cada lista vive en su hoja. */
function ListSheet({ spec, onClose }: { spec: ListSpec | null; onClose: () => void }) {
  const [values, setValues] = useState<string[]>([]);

  const draft = spec ? spec.fields.map((_, index) => values[index] ?? "") : [];
  const canAdd = draft.length > 0 && draft.every((value) => value.trim().length > 0);

  const close = () => {
    setValues([]);
    onClose();
  };

  const add = async () => {
    if (!spec || !canAdd) return;
    await spec.add(draft.map((value) => value.trim()));
    setValues([]);
  };

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={spec !== null}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{spec?.title ?? ""}</Text>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              onPress={close}
              style={styles.close}
            >
              <Icon color={colors.textSecondary} name="close" size={20} />
            </Pressable>
          </View>
          <Text style={styles.sheetNote}>{spec?.note ?? ""}</Text>
          {spec?.fields.map((placeholder, index) => (
            <TextInput
              key={placeholder}
              onChangeText={(value) =>
                setValues((current) =>
                  spec.fields.map((_, slot) => (slot === index ? value : (current[slot] ?? ""))),
                )
              }
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={draft[index] ?? ""}
            />
          ))}
          <Button
            disabled={!canAdd}
            icon="plus"
            label={spec?.addLabel ?? "Añadir"}
            onPress={() => void add()}
            variant="secondary"
          />
          <ScrollView contentContainerStyle={styles.sheetList}>
            {spec && spec.items.length === 0 ? (
              <EmptyState body={spec.emptyBody} title={spec.emptyTitle} />
            ) : (
              spec?.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <Text style={styles.itemValue}>{item.value}</Text>
                  <Pressable
                    accessibilityLabel={`Eliminar ${item.value}`}
                    accessibilityRole="button"
                    onPress={() => void spec.remove(item.id)}
                    style={styles.itemRemove}
                  >
                    <Icon color={colors.danger} name="close" size={16} />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function buildLists({
  dictionary,
  replacements,
  snippets,
}: {
  dictionary: ReturnType<typeof useDictationDictionary>;
  replacements: ReturnType<typeof useDictationReplacements>;
  snippets: ReturnType<typeof useDictationSnippets>;
}): ListSpec[] {
  return [
    {
      add: async ([term]) => {
        await dictionary.add(term ?? "");
      },
      addLabel: "Añadir término",
      emptyBody: "Añade los nombres propios y los tecnicismos que el dictado se come.",
      emptyTitle: "Sin términos",
      fields: ["Término, p. ej. Telepatia"],
      items: dictionary.entries.map((entry) => ({ id: entry.id, value: entry.term })),
      kind: "dictionary",
      note: "Nombres y términos que debe reconocer",
      remove: dictionary.remove,
      title: "Diccionario",
    },
    {
      add: async ([source, destination]) => {
        await replacements.add(source ?? "", destination ?? "");
      },
      addLabel: "Añadir reemplazo",
      emptyBody: "Un reemplazo corrige una palabra dictada justo antes de insertarla.",
      emptyTitle: "Sin reemplazos",
      fields: ["Lo que dices", "Lo que debe escribirse"],
      items: replacements.rules.map((rule) => ({
        id: rule.id,
        value: `${rule.source} → ${rule.destination}`,
      })),
      kind: "replacements",
      note: "Corrige una palabra antes de insertarla",
      remove: replacements.remove,
      title: "Reemplazos",
    },
    {
      add: async ([trigger, expansion]) => {
        await snippets.add(trigger ?? "", expansion ?? "");
      },
      addLabel: "Añadir snippet",
      emptyBody: "Un snippet convierte un atajo de voz en el texto largo que dictas a diario.",
      emptyTitle: "Sin snippets",
      fields: ["Disparador", "Texto expandido"],
      items: snippets.snippets.map((snippet) => ({
        id: snippet.id,
        value: `${snippet.trigger} → ${snippet.expansion}`,
      })),
      kind: "snippets",
      note: "Atajos de voz que se expanden solos",
      remove: snippets.remove,
      title: "Snippets",
    },
  ];
}

function syncSummary(syncedAt: number | null, terms: number): string {
  const count = `${terms} ${terms === 1 ? "término" : "términos"}`;
  if (syncedAt === null) return `Sin sincronizar en esta sesión · ${count}`;
  return `Sincronizado ${elapsedLabel(Date.now() - syncedAt)} · ${count}`;
}

function elapsedLabel(elapsedMs: number): string {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

const BADGE_SIZE = 34;
const STEP_BADGE_SIZE = 22;
const ROW_COUNT_WIDTH = 38;
const ROW_HEIGHT = 66;

const styles = StyleSheet.create({
  activeBadge: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.md,
    height: BADGE_SIZE,
    justifyContent: "center",
    width: BADGE_SIZE,
  },
  activeCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.accent,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 15,
  },
  activeCopy: { flex: 1, gap: 2 },
  activeMeta: { ...typography.meta, color: colors.muted },
  activeTitle: { ...typography.item, color: colors.text },
  back: { alignItems: "center", height: hitTarget, justifyContent: "center", width: hitTarget },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  close: { alignItems: "center", height: hitTarget, justifyContent: "center", width: hitTarget },
  content: { gap: 22, paddingBottom: 40, paddingHorizontal: space.xl },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 46,
    justifyContent: "space-between",
    paddingLeft: 6,
    paddingRight: 14,
  },
  input: {
    ...typography.body,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    paddingHorizontal: space.md,
    paddingVertical: 11,
  },
  item: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space.sm,
    paddingVertical: 10,
  },
  itemRemove: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  itemValue: { ...typography.body, color: colors.text, flex: 1 },
  pressed: { opacity: 0.6 },
  row: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: space.lg,
  },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowCount: {
    ...typography.section,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    width: ROW_COUNT_WIDTH,
  },
  rowNote: { ...typography.meta, color: colors.muted },
  rowPressed: { backgroundColor: colors.surface },
  rowTitle: { ...typography.item, color: colors.text },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  section: { gap: 10 },
  sectionNote: { ...typography.meta, color: colors.muted, lineHeight: 20 },
  setupCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: space.md,
    padding: space.xl,
  },
  setupMeta: { ...typography.meta, color: colors.muted },
  setupTitle: { ...typography.item, color: colors.text },
  sheet: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: space.md,
    maxHeight: "82%",
    padding: space.xl,
  },
  sheetHead: { alignItems: "center", flexDirection: "row" },
  sheetList: { paddingBottom: space.lg },
  sheetNote: { ...typography.meta, color: colors.muted },
  sheetTitle: { ...typography.section, color: colors.text, flex: 1 },
  statusCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: space.md,
  },
  step: { alignItems: "flex-start", flexDirection: "row", gap: space.md },
  stepBadge: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: STEP_BADGE_SIZE,
    justifyContent: "center",
    width: STEP_BADGE_SIZE,
  },
  stepBadgeDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepNumber: { ...typography.meta, color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  stepNumberDone: { color: colors.onAccent },
  stepText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  stepTextDone: { color: colors.muted },
  support: { ...typography.body, color: colors.muted },
  syncAction: { alignItems: "center", flexDirection: "row", gap: 7, height: hitTarget },
  syncActionText: { ...typography.meta, color: colors.accent, fontWeight: "600" },
  title: { ...typography.display, color: colors.text },
  titleBlock: { gap: 7, paddingBottom: 18, paddingHorizontal: space.xl, paddingTop: space.xs },
});

type FailureKind = "settings" | "sync";

type Failure = { detail: string; kind: FailureKind };

type ListKind = "dictionary" | "replacements" | "snippets";

interface KeyboardItem {
  id: string;
  value: string;
}

interface ListSpec {
  add: (values: string[]) => Promise<void>;
  addLabel: string;
  emptyBody: string;
  emptyTitle: string;
  fields: string[];
  items: KeyboardItem[];
  kind: ListKind;
  note: string;
  remove: (id: string) => Promise<void>;
  title: string;
}
