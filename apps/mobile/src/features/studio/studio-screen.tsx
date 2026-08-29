import {
  type ReplacementRule,
  useDictationDictionary,
  useDictationReplacements,
  useDictationSettings,
} from "@looper/data";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/components/button";
import { Icon } from "@/shared/components/icon";
import { ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import {
  createSmartMode,
  type MobileStudioSettings,
  normalizeStudioSettings,
  type SmartMode,
  studioSettingsData,
  type WritingStyle,
} from "@/shared/studio/studio-settings";
import { colors } from "@/shared/theme/colors";
import { radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";

const FORMAT_LABEL: Record<SmartMode["format"], string> = {
  bullets: "viñetas",
  email: "email",
  message: "mensaje",
  none: "sin formato",
  todo: "tareas",
};

/**
 * Studio es pantalla empujada, no tab: se abre desde la cabecera de Library y
 * vuelve con el chevron. Importar cuelga del pie porque es configuración de una
 * vez, no algo diario.
 */
export function StudioScreen() {
  const router = useRouter();
  const remote = useDictationSettings();
  const [settings, setSettings] = useState(() => normalizeStudioSettings(remote.doc?.data));
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState<MobileStudioSettings | null>(null);

  useEffect(() => {
    if (!remote.isLoading) setSettings(normalizeStudioSettings(remote.doc?.data));
  }, [remote.doc?.data, remote.isLoading]);

  const persist = async (next: MobileStudioSettings) => {
    setSettings(next);
    setFailed(null);
    setStatus("Guardando…");
    try {
      await remote.update(studioSettingsData(next));
      setStatus("Guardado. El teclado se actualiza automáticamente.");
    } catch {
      setStatus(null);
      setFailed(next);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>STUDIO</Text>
        <Text style={styles.title}>Cómo escribe</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {failed ? (
          <ErrorState
            body="Tus cambios siguen en pantalla, pero el teclado aún usa la última versión guardada."
            onRetry={() => void persist(failed)}
            title="No se pudo guardar Studio"
          />
        ) : null}
        {remote.isLoading ? (
          <StudioSkeleton />
        ) : (
          <CleaningCard
            select={(activeStyleId) => void persist({ ...settings, activeStyleId })}
            settings={settings}
          />
        )}
        <Pressable
          accessibilityLabel="Abrir ajustes de dictado"
          accessibilityRole="button"
          onPress={() => router.push("/(app)/keyboard")}
          style={styles.dictationSettingsLink}
        >
          <View>
            <Text style={styles.dictationSettingsTitle}>Ajustes de dictado</Text>
            <Text style={styles.dictationSettingsHint}>Teclado, vocabulario y correcciones</Text>
          </View>
          <Icon color={colors.muted} name="chevronRight" size={18} strokeWidth={2.2} />
        </Pressable>
        {status ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {status}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function VocabularyTab({
  dictionary,
}: {
  dictionary: ReturnType<typeof useDictationDictionary>;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const term = draft.trim();
    if (!term) return;
    setDraft("");
    void dictionary.add(term);
  };
  return (
    <View style={styles.studioCard}>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>Vocabulario</Text>
        <Text style={styles.count}>{dictionary.isLoading ? "…" : dictionary.entries.length}</Text>
      </View>
      <Text style={styles.cardHint}>Nombres y términos que Looper debe respetar al dictar.</Text>
      <View style={styles.wordCloud}>
        {dictionary.entries.map((entry) => (
          <Pressable
            accessibilityLabel={`Eliminar ${entry.term}`}
            accessibilityRole="button"
            key={entry.id}
            onPress={() => void dictionary.remove(entry.id)}
            style={styles.word}
          >
            <Text style={styles.wordText}>{entry.term}</Text>
            <Text style={styles.wordRemove}>×</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.addWordRow}>
        <TextInput
          accessibilityLabel="Añadir palabra al vocabulario"
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="Añadir palabra"
          placeholderTextColor={colors.disabled}
          returnKeyType="done"
          style={styles.addWordInput}
          value={draft}
        />
        <Pressable accessibilityLabel="Guardar palabra" accessibilityRole="button" onPress={add} style={styles.addWordButton}>
          <Text style={styles.addWordButtonText}>Añadir</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReplacementTab({
  replacements,
}: {
  replacements: ReturnType<typeof useDictationReplacements>;
}) {
  return (
    <View style={styles.studioCard}>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>Correcciones</Text>
        <Text style={styles.count}>{replacements.isLoading ? "…" : replacements.rules.length}</Text>
      </View>
      <Text style={styles.cardHint}>Se aplican al terminar cada transcripción.</Text>
      {replacements.rules.length ? (
        replacements.rules.map((rule) => <ReplacementRow key={rule.id} replacements={replacements} rule={rule} />)
      ) : (
        <Text style={styles.emptyInline}>
          {replacements.isLoading ? "Cargando correcciones…" : "Aún no hay correcciones guardadas."}
        </Text>
      )}
    </View>
  );
}

function ReplacementRow({
  replacements,
  rule,
}: {
  replacements: ReturnType<typeof useDictationReplacements>;
  rule: ReplacementRule;
}) {
  return (
    <Pressable
      accessibilityLabel={`Eliminar corrección ${rule.source}`}
      accessibilityRole="button"
      onPress={() => void replacements.remove(rule.id)}
      style={styles.replacementRow}
    >
      <Text style={styles.replacementText}>{rule.source} → {rule.destination}</Text>
      <Text style={styles.wordRemove}>×</Text>
    </Pressable>
  );
}

function CleaningCard({
  select,
  settings,
}: {
  select: (id: string) => void;
  settings: MobileStudioSettings;
}) {
  const active = settings.styles.find((style) => style.id === settings.activeStyleId);
  const levels = settings.styles.slice(0, 3);
  return (
    <View style={styles.cleaningCard}>
      <View style={styles.cleaningHead}>
        <Text style={styles.cleaningName}>Nivel de limpieza</Text>
        <Text style={styles.cleaningValue}>{active?.name ?? "Ligero"}</Text>
      </View>
      <View style={styles.swatch}>
        <View style={styles.swatchLine}>
          <Text style={styles.swatchLabel}>DIJISTE</Text>
          <Text style={styles.swatchDim}>
            O sea que el original se queda ahí al lado para que no se pierda nada.
          </Text>
        </View>
        <View style={styles.swatchLine}>
          <Text style={styles.swatchLabel}>SALE</Text>
          <Text style={styles.swatchText}>
            {active?.example ?? "El original se queda al lado, así no se pierde nada."}
          </Text>
        </View>
      </View>
      <View style={styles.levels}>
        {levels.map((style) => {
          const selected = style.id === settings.activeStyleId;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={style.id}
              onPress={() => select(style.id)}
              style={[styles.level, selected && styles.levelSelected]}
            >
              <Text style={[styles.levelText, selected && styles.levelTextSelected]}>
                {style.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StylesTab({
  onCreate,
  select,
  settings,
  showAll,
  toggleAll,
}: {
  onCreate: () => void;
  select: (id: string) => void;
  settings: MobileStudioSettings;
  showAll: boolean;
  toggleAll: () => void;
}) {
  const active = settings.styles.find((style) => style.id === settings.activeStyleId);
  const visibleStyles = showAll || !active ? settings.styles : [active];
  return (
    <View style={styles.list}>
      {visibleStyles.map((style) => (
        <StyleCard
          key={style.id}
          onPress={() => select(style.id)}
          selected={style.id === settings.activeStyleId}
          writingStyle={style}
        />
      ))}
      {settings.styles.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={toggleAll} style={styles.disclosure}>
          <Text style={styles.disclosureText}>
            {showAll ? "Ver menos estilos" : "Ver todos los estilos"}
          </Text>
          <Icon color={colors.accent} name={showAll ? "chevronDown" : "chevronRight"} size={16} />
        </Pressable>
      ) : null}
      <CreateRow label="Nuevo estilo" onPress={onCreate} />
    </View>
  );
}

/**
 * La caja «suena así» es lo que hace entendible la pantalla: sin el ejemplo, el
 * nombre del estilo no dice nada.
 */
function StyleCard({
  onPress,
  selected,
  writingStyle,
}: {
  onPress: () => void;
  selected: boolean;
  writingStyle: WritingStyle;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.dimmed,
      ]}
    >
      <View style={styles.styleHead}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{writingStyle.name}</Text>
          <Text style={styles.rowNote}>{writingStyle.description}</Text>
        </View>
      </View>
      <View style={styles.example}>
        <SectionLabel>Suena así</SectionLabel>
        <Text style={styles.exampleText}>{writingStyle.example}</Text>
      </View>
    </Pressable>
  );
}

function ModesTab({
  modes,
  onCreate,
  toggle,
  writingStyles,
}: {
  modes: SmartMode[];
  onCreate: () => void;
  toggle: (id: string) => void;
  writingStyles: WritingStyle[];
}) {
  return (
    <View style={styles.list}>
      {modes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.rowTitle}>Todavía no hay Smart Modes</Text>
          <Text style={styles.rowNote}>
            Un Smart Mode fija estilo y formato para un contexto: email, mensajes, notas o
            seguimiento de reuniones.
          </Text>
        </View>
      ) : (
        modes.map((mode) => (
          <ModeRow key={mode.id} mode={mode} toggle={toggle} writingStyles={writingStyles} />
        ))
      )}
      <CreateRow label="Nuevo Smart Mode" onPress={onCreate} />
      <View style={styles.note}>
        <Text style={styles.rowNote}>
          En iPhone eliges el modo desde el teclado. En Android puede activarse solo según la app en
          la que escribas.
        </Text>
      </View>
    </View>
  );
}

function ModeRow({
  mode,
  toggle,
  writingStyles,
}: {
  mode: SmartMode;
  toggle: (id: string) => void;
  writingStyles: WritingStyle[];
}) {
  const styleName = writingStyles.find((item) => item.id === mode.styleId)?.name ?? "Estilo";
  const where =
    mode.triggerType === "manual"
      ? "Lo eliges en el teclado"
      : `Al escribir en ${mode.triggerValue}`;

  return (
    <View style={styles.card}>
      <View style={styles.modeRow}>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, !mode.enabled && styles.rowTitleOff]}>{mode.name}</Text>
          <Text style={styles.rowNote}>
            {where} · {styleName} · {FORMAT_LABEL[mode.format]}
          </Text>
        </View>
        <Switch
          accessibilityLabel={mode.name}
          onValueChange={() => toggle(mode.id)}
          trackColor={{ false: colors.surface, true: colors.accent }}
          value={mode.enabled}
        />
      </View>
    </View>
  );
}

/** Sustituye al FAB: crear vive al final de la lista, no encima del contenido. */
function CreateRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.createRow, pressed && styles.dimmed]}
    >
      <Icon color={colors.muted} name="plus" size={17} strokeWidth={2.2} />
      <Text style={styles.createLabel}>{label}</Text>
    </Pressable>
  );
}

function StudioSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.list}
    >
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.card}>
          <View style={styles.styleHead}>
            <View style={styles.radio} />
            <View style={styles.rowCopy}>
              <View style={styles.skeletonBarWide} />
              <View style={styles.skeletonBarNarrow} />
            </View>
          </View>
          <View style={styles.skeletonExample} />
        </View>
      ))}
    </View>
  );
}

function StudioEditor({
  kind,
  onClose,
  onMode,
  onStyle,
  writingStyles,
}: {
  kind: "style" | "mode" | null;
  onClose: () => void;
  onMode: (mode: SmartMode) => void;
  onStyle: (style: WritingStyle) => void;
  writingStyles: WritingStyle[];
}) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [styleId, setStyleId] = useState(writingStyles[0]?.id ?? "concise");
  const [format, setFormat] = useState<SmartMode["format"]>("none");

  const save = () => {
    if (!name.trim()) return;
    if (kind === "style") {
      onStyle({
        description: "Personalizado",
        example: "Vista previa disponible al usar este estilo.",
        id: `style_${Date.now()}`,
        name: name.trim(),
        promptTemplate: instructions.trim(),
      });
    } else if (kind === "mode") {
      onMode(createSmartMode({ format, instructions, name, styleId }));
    }
    setName("");
    setInstructions("");
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={kind !== null}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>
              {kind === "style" ? "Nuevo estilo" : "Nuevo Smart Mode"}
            </Text>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <Icon color={colors.text} name="close" size={18} />
            </Pressable>
          </View>
          <TextInput
            onChangeText={setName}
            placeholder="Nombre"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={name}
          />
          {kind === "mode" ? (
            <>
              <SectionLabel>Estilo</SectionLabel>
              <View style={styles.options}>
                {writingStyles.map((item) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: styleId === item.id }}
                    key={item.id}
                    onPress={() => setStyleId(item.id)}
                    style={[styles.option, styleId === item.id && styles.optionSelected]}
                  >
                    <Text style={styles.optionLabel}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
              <SectionLabel>Formato</SectionLabel>
              <View style={styles.options}>
                {(["none", "email", "message", "bullets", "todo"] as const).map((value) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: format === value }}
                    key={value}
                    onPress={() => setFormat(value)}
                    style={[styles.option, format === value && styles.optionSelected]}
                  >
                    <Text style={styles.optionLabel}>{FORMAT_LABEL[value]}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <TextInput
            multiline
            onChangeText={setInstructions}
            placeholder="Instrucciones"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.instructions]}
            textAlignVertical="top"
            value={instructions}
          />
          <Button disabled={!name.trim()} label="Guardar" onPress={save} variant="primary" />
        </View>
      </View>
    </Modal>
  );
}

const SCREEN_PAD = 20;
const SHEET_RADIUS = 22;

const styles = StyleSheet.create({
  addWordButton: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  addWordButtonText: { ...typography.meta, color: colors.accent, fontWeight: "700" },
  addWordInput: { ...typography.body, color: colors.text, flex: 1, minHeight: 42, paddingHorizontal: 12 },
  addWordRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
  },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
    padding: space.lg,
  },
  cardSelected: { borderColor: colors.accent },
  cardHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardHint: { ...typography.meta, color: colors.muted, lineHeight: 18 },
  cardTitle: { ...typography.item, color: colors.text },
  close: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  content: { gap: space.lg, paddingBottom: 108, paddingHorizontal: space.lg },
  cleaningHint: { ...typography.meta, color: colors.muted, marginTop: 3 },
  cleaningCard: { backgroundColor: colors.surface, borderRadius: radius.lg, gap: 13, marginTop: 6, padding: 15 },
  cleaningHead: { alignItems: "center", flexDirection: "row" },
  cleaningIntro: { gap: 2 },
  cleaningLabel: { ...typography.item, color: colors.text },
  cleaningName: { ...typography.item, color: colors.text, flex: 1 },
  cleaningValue: { ...typography.meta, color: colors.muted },
  createLabel: { ...typography.body, color: colors.muted, fontWeight: "600" },
  createRow: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 52,
  },
  count: {
    ...typography.meta,
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.pill,
    color: colors.accent,
    fontWeight: "700",
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center",
  },
  dimmed: { opacity: 0.6 },
  dictationSettingsHint: { ...typography.meta, color: colors.muted, marginTop: 2 },
  dictationSettingsLink: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: 2,
  },
  dictationSettingsTitle: { ...typography.item, color: colors.text },
  disclosure: { alignItems: "center", flexDirection: "row", gap: space.xs, minHeight: 36 },
  disclosureText: { ...typography.meta, color: colors.accent, fontWeight: "700" },
  emptyCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: space.xs,
    padding: space.xl,
  },
  emptyInline: { ...typography.meta, color: colors.muted, paddingVertical: 6 },
  example: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
    padding: space.md,
  },
  exampleText: { ...typography.body, color: colors.textSecondary },
  input: {
    ...typography.body,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  instructions: { minHeight: 88, paddingTop: space.md },
  intro: { gap: 3, paddingBottom: 10, paddingHorizontal: space.lg, paddingTop: space.md },
  kicker: { ...typography.label, color: colors.accent, letterSpacing: 1.1 },
  lede: { ...typography.body, color: colors.muted },
  list: { gap: 9 },
  level: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 30,
    paddingHorizontal: 11,
    justifyContent: "center",
  },
  levels: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  levelSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  levelText: { ...typography.meta, color: colors.textSecondary, fontWeight: "600" },
  levelTextSelected: { color: colors.accent },
  modeRow: { alignItems: "center", flexDirection: "row", gap: 13 },
  modesDisclosure: { alignItems: "center", flexDirection: "row", gap: space.xs, minHeight: 44 },
  note: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: 6,
    padding: space.lg,
  },
  option: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: space.sm,
  },
  optionLabel: { ...typography.meta, color: colors.textSecondary, fontWeight: "600" },
  optionSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  radio: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  radioDot: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 9,
    width: 9,
  },
  radioSelected: { borderColor: colors.accent },
  replacementRow: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  replacementText: { ...typography.meta, color: colors.textSecondary, fontWeight: "600" },
  rowCopy: { flex: 1, gap: 2 },
  rowNote: { ...typography.meta, color: colors.muted, lineHeight: 19 },
  rowTitle: { ...typography.item, color: colors.text },
  rowTitleOff: { color: colors.muted },
  sectionTab: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 32,
    paddingHorizontal: 13,
    justifyContent: "center",
  },
  sectionTabActive: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  sectionTabText: { ...typography.meta, color: colors.textSecondary, fontWeight: "700" },
  sectionTabTextActive: { color: colors.accent },
  sectionTabs: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingBottom: space.md,
    paddingHorizontal: SCREEN_PAD,
  },
  sectionTabsScroller: { maxHeight: 48, minHeight: 48 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  sheet: {
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    gap: 14,
    padding: SCREEN_PAD,
    paddingBottom: 34,
  },
  sheetHead: { alignItems: "center", flexDirection: "row" },
  sheetTitle: { ...typography.section, color: colors.text, flex: 1 },
  skeletonBarNarrow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    height: 10,
    width: "45%",
  },
  skeletonBarWide: {
    backgroundColor: colors.surface,
    borderRadius: radius.xs,
    height: 12,
    width: "62%",
  },
  skeletonExample: { backgroundColor: colors.surface, borderRadius: radius.md, height: 72 },
  status: { ...typography.meta, color: colors.muted },
  studioCard: { backgroundColor: colors.surface, borderRadius: radius.lg, gap: 12, padding: 15 },
  stylesSection: { gap: 9, marginTop: 6 },
  styleHead: { alignItems: "center", flexDirection: "row", gap: space.md },
  swatch: { gap: 9 },
  swatchDim: {
    ...typography.meta,
    color: colors.muted,
    flex: 1,
    fontStyle: "italic",
    lineHeight: 18,
  },
  swatchLabel: {
    ...typography.label,
    color: colors.disabled,
    fontSize: 9,
    letterSpacing: 0.7,
    width: 58,
  },
  swatchLine: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  swatchText: { ...typography.meta, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  title: { ...typography.title, color: colors.text },
  word: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  wordCloud: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  wordRemove: { ...typography.meta, color: colors.muted, fontWeight: "700" },
  wordText: { ...typography.meta, color: colors.accentDark, fontWeight: "700" },
});
