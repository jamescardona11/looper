import {
  useDictationDictionary,
  useDictationReplacements,
  useDictationSnippets,
} from "@looper/data";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/components/button";
import { Icon } from "@/shared/components/icon";
import { EmptyState, ErrorState, SkeletonRow } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import {
  isNativeKeyboardAvailable,
  isNativeKeyboardEnabled,
  openNativeKeyboardSettings,
} from "./native-keyboard";

/**
 * iOS no expone la lista de teclados activos. La extensión comparte si tuvo
 * acceso completo la última vez que se abrió, que es evidencia útil pero no
 * sustituye una comprobación actual de Ajustes.
 */
const FAILURE_COPY: Record<FailureKind, { body: string; title: string }> = {
  settings: {
    body: "Ábrelos a mano en Ajustes › General › Teclado › Teclados.",
    title: "No se pudieron abrir los ajustes",
  },
};

export function KeyboardScreen() {
  const router = useRouter();
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const snippets = useDictationSnippets();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [openList, setOpenList] = useState<ListKind | null>(null);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasBridge = isNativeKeyboardAvailable();

  const refreshStatus = useCallback(() => {
    setEnabled(null);
    void isNativeKeyboardEnabled()
      .then((value) => setEnabled(value))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(refreshStatus, [refreshStatus]);
  useFocusEffect(refreshStatus);

  const openSettings = () => {
    void openNativeKeyboardSettings()
      .then(() => setFailure(null))
      .catch((cause: unknown) => setFailure({ detail: messageOf(cause), kind: "settings" }));
  };

  const lists = buildLists({ dictionary, replacements, snippets });
  const openSpec = lists.find((list) => list.kind === openList) ?? null;
  const listsLoading = dictionary.isLoading || replacements.isLoading || snippets.isLoading;
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
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>TECLADO</Text>
        <Text style={styles.title}>Dicta en cualquier app.</Text>
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
            onRetry={openSettings}
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
              <Text style={styles.activeTitle}>Teclado confirmado</Text>
              <Text accessibilityLiveRegion="polite" style={styles.activeMeta}>
                La última vez que abriste Looper tenía acceso completo. Si cambiaste Ajustes,
                compruébalo desde el globo.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.setupCard}>
            <Text style={styles.setupCount}>
              3 pasos <Text style={styles.setupCountMuted}>para activarlo</Text>
            </Text>
            <KeyboardSetupSteps onOpenSettings={openSettings} />
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced((current) => !current)}
          style={styles.advancedDisclosure}
        >
          <Text style={styles.advancedText}>Formato, diccionario y atajos</Text>
          <Icon
            color={colors.accent}
            name={showAdvanced ? "chevronDown" : "chevronRight"}
            size={17}
          />
        </Pressable>

        {showAdvanced ? (
          <>
            <View style={styles.section}>
              <SectionLabel>Lo que el teclado sabe</SectionLabel>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowKnowledge((current) => !current)}
                style={styles.knowledgeDisclosure}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>Diccionario y atajos</Text>
                  <Text style={styles.rowNote}>Términos, reemplazos y snippets</Text>
                </View>
                <Icon
                  color={colors.accent}
                  name={showKnowledge ? "chevronDown" : "chevronRight"}
                  size={17}
                  strokeWidth={2.2}
                />
              </Pressable>
              {showKnowledge &&
                (listsLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : (
                  lists.map((list) => (
                    <KnowledgeRow
                      key={list.kind}
                      onPress={() => setOpenList(list.kind)}
                      spec={list}
                    />
                  ))
                ))}
            </View>
            <SpokenCommandsCard />
          </>
        ) : null}
      </ScrollView>

      <ListSheet onClose={() => setOpenList(null)} spec={openSpec} />
    </SafeAreaView>
  );
}

function KeyboardSetupSteps({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <View style={styles.steps}>
      <SetupStep
        number="1"
        subtitle="Aparece en Ajustes › Teclados"
        title="Añadir el teclado Looper"
      />
      <SetupStep number="2" subtitle="Se abre al tocar el globo" title="Cambiar a Looper" />
      <SetupStep
        action={<Button label="Abrir ajustes" onPress={onOpenSettings} variant="primary" />}
        detail="iOS lo exige para conectar la extensión al servicio de dictado. Solo escucha después de pulsar el micrófono. Puedes volver al teclado del sistema en cualquier momento."
        number="3"
        subtitle="Sin acceso completo no puede dictar"
        title="Permitir acceso completo"
      />
    </View>
  );
}

function SetupStep({
  action,
  complete = false,
  detail,
  number,
  subtitle,
  title,
}: {
  action?: ReactNode;
  complete?: boolean;
  detail?: string;
  number: string;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepBadge, complete && styles.stepBadgeDone]}>
        {complete ? (
          <Icon color={colors.onAccent} name="check" size={13} strokeWidth={2.8} />
        ) : (
          <Text style={styles.stepNumber}>{number}</Text>
        )}
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, complete && styles.stepTitleDone]}>{title}</Text>
        <Text style={styles.stepSubtitle}>{subtitle}</Text>
        {action ? <View style={styles.stepAction}>{action}</View> : null}
        {detail ? (
          <Text accessibilityLiveRegion="polite" style={styles.setupMeta}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function SpokenCommandsCard() {
  return (
    <View style={styles.commandsCard}>
      <Text style={styles.commandsKicker}>SE DICE, NO SE TOCA</Text>
      {[
        ["«coma» · «punto» · «nueva línea»", "puntuación"],
        ["«mejor dicho» · «borra eso»", "corrige"],
        ["«punto de lista» · «siguiente elemento»", "listas"],
        ["«modo literal» · «fin modo literal»", "sin formato"],
      ].map(([command, meaning]) => (
        <View key={command} style={styles.commandRow}>
          <Text style={styles.commandText}>{command}</Text>
          <Text style={styles.commandMeaning}>{meaning}</Text>
        </View>
      ))}
    </View>
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
        <Pressable
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
        >
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
              accessibilityLabel={placeholder}
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
        </KeyboardAvoidingView>
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

const BADGE_SIZE = 34;
const STEP_BADGE_SIZE = 22;
const ROW_COUNT_WIDTH = 38;
const ROW_HEIGHT = 66;

const styles = StyleSheet.create({
  advancedDisclosure: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 44 },
  advancedText: { ...typography.meta, color: colors.accent, fontWeight: "700" },
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
  close: { alignItems: "center", height: hitTarget, justifyContent: "center", width: hitTarget },
  commandMeaning: {
    ...typography.meta,
    color: colors.muted,
    fontWeight: "700",
    textAlign: "right",
  },
  commandRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: space.sm,
    minHeight: 34,
    paddingHorizontal: space.sm,
  },
  commandText: { ...typography.meta, color: colors.textSecondary, flex: 1 },
  commandsCard: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 5,
    padding: space.sm,
  },
  commandsKicker: {
    ...typography.label,
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 0.9,
    paddingBottom: 2,
  },
  content: { gap: 22, paddingBottom: 40, paddingHorizontal: space.xl },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 46,
    justifyContent: "space-between",
    paddingLeft: 6,
    paddingRight: 14,
  },
  headerSpacer: { width: hitTarget },
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
  knowledgeDisclosure: {
    alignItems: "center",
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: space.md,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: space.lg,
  },
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
  setupCard: {
    borderLeftColor: colors.accent,
    borderLeftWidth: 2,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  setupCount: { ...typography.item, color: colors.text },
  setupCountMuted: { color: colors.muted, fontWeight: "400" },
  setupMeta: { ...typography.meta, color: colors.muted },
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
  stepAction: { marginTop: space.sm },
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
  stepCopy: { flex: 1, gap: 3, paddingBottom: space.sm },
  stepNumber: { ...typography.meta, color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  stepSubtitle: { ...typography.meta, color: colors.muted, lineHeight: 18 },
  stepTitle: { ...typography.item, color: colors.text },
  stepTitleDone: { color: colors.textSecondary },
  steps: { gap: space.sm },
  kicker: { ...typography.label, color: colors.muted, letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.text },
  titleBlock: { gap: 7, paddingBottom: 18, paddingHorizontal: space.xl, paddingTop: space.xs },
});

type FailureKind = "settings";

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
