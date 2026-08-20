import { useDictationSettings } from "@looper/data";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { hitTarget, radius, relief, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";

type StudioTab = "styles" | "modes";

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
  const [tab, setTab] = useState<StudioTab>("styles");
  const [editor, setEditor] = useState<"style" | "mode" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState<MobileStudioSettings | null>(null);

  useEffect(() => {
    if (!remote.isLoading) setSettings(normalizeStudioSettings(remote.doc?.data));
  }, [remote.doc?.data, remote.isLoading]);

  useFocusEffect(
    useCallback(
      () => () => {
        setEditor(null);
      },
      [],
    ),
  );

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

  const toggleMode = (id: string) =>
    void persist({
      ...settings,
      smartModes: settings.smartModes.map((mode) =>
        mode.id === id ? { ...mode, enabled: !mode.enabled } : mode,
      ),
    });

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
        <Pressable
          accessibilityLabel="Ajustes del teclado"
          accessibilityRole="button"
          onPress={() => router.push("/keyboard" as Href)}
          style={({ pressed }) => [styles.keyboardButton, pressed && styles.sunk]}
        >
          <Icon color={colors.textSecondary} name="keyboard" size={16} />
          <Text style={styles.keyboardLabel}>Teclado</Text>
        </Pressable>
      </View>

      <View style={styles.intro}>
        <Text style={styles.title}>Studio</Text>
        <Text style={styles.lede}>
          No inventa contenido: solo cambia la forma de lo que dictas.
        </Text>
      </View>

      <View accessibilityLabel="Secciones de Studio" style={styles.segmented}>
        <Segment active={tab === "styles"} label="Estilos" onPress={() => setTab("styles")} />
        <Segment active={tab === "modes"} label="Smart Modes" onPress={() => setTab("modes")} />
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
        ) : tab === "styles" ? (
          <StylesTab
            onCreate={() => setEditor("style")}
            select={(activeStyleId) => void persist({ ...settings, activeStyleId })}
            settings={settings}
          />
        ) : (
          <ModesTab
            modes={settings.smartModes}
            onCreate={() => setEditor("mode")}
            toggle={toggleMode}
            writingStyles={settings.styles}
          />
        )}
        {status ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {status}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityHint="Diccionario, reemplazos, estilos y transcripciones"
          accessibilityLabel="Importar desde otra app"
          accessibilityRole="button"
          onPress={() => router.push("/import" as Href)}
          style={({ pressed }) => [styles.importRow, pressed && styles.dimmed]}
        >
          <View style={styles.importTile}>
            <Icon color={colors.textSecondary} name="import" size={17} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>Importar desde otra app</Text>
            <Text style={styles.rowNote}>Diccionario, reemplazos, estilos y transcripciones</Text>
          </View>
          <Icon color={colors.disabled} name="chevronRight" size={17} strokeWidth={2.2} />
        </Pressable>
      </View>

      <StudioEditor
        kind={editor}
        onClose={() => setEditor(null)}
        onMode={(mode) => {
          setEditor(null);
          void persist({ ...settings, smartModes: [...settings.smartModes, mode] });
        }}
        onStyle={(style) => {
          setEditor(null);
          void persist({
            ...settings,
            activeStyleId: style.id,
            styles: [...settings.styles, style],
          });
        }}
        writingStyles={settings.styles}
      />
    </SafeAreaView>
  );
}

function Segment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function StylesTab({
  onCreate,
  select,
  settings,
}: {
  onCreate: () => void;
  select: (id: string) => void;
  settings: MobileStudioSettings;
}) {
  return (
    <View style={styles.list}>
      {settings.styles.map((style) => (
        <StyleCard
          key={style.id}
          onPress={() => select(style.id)}
          selected={style.id === settings.activeStyleId}
          writingStyle={style}
        />
      ))}
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
  back: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
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
  close: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  content: { gap: space.lg, paddingBottom: space.xxl, paddingHorizontal: SCREEN_PAD },
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
  dimmed: { opacity: 0.6 },
  emptyCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: space.xs,
    padding: space.xl,
  },
  example: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
    padding: space.md,
  },
  exampleText: { ...typography.body, color: colors.textSecondary },
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: space.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 46,
    paddingLeft: 6,
    paddingRight: 10,
  },
  importRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    minHeight: 56,
    paddingHorizontal: space.xs,
  },
  importTile: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
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
  intro: { gap: 7, paddingBottom: space.lg, paddingHorizontal: SCREEN_PAD, paddingTop: space.xs },
  keyboardButton: {
    ...relief.secondary,
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: space.sm,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  keyboardLabel: { ...typography.meta, color: colors.textSecondary, fontWeight: "600" },
  lede: { ...typography.body, color: colors.muted },
  list: { gap: 9 },
  modeRow: { alignItems: "center", flexDirection: "row", gap: 13 },
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
  rowCopy: { flex: 1, gap: 2 },
  rowNote: { ...typography.meta, color: colors.muted, lineHeight: 19 },
  rowTitle: { ...typography.item, color: colors.text },
  rowTitleOff: { color: colors.muted },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  segment: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  segmentActive: { backgroundColor: colors.surface },
  segmentLabel: { ...typography.meta, color: colors.muted, fontWeight: "600" },
  segmentLabelActive: { color: colors.text, fontWeight: "700" },
  segmented: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.xs,
    marginBottom: 14,
    marginHorizontal: SCREEN_PAD,
    padding: space.xs,
  },
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
  styleHead: { alignItems: "center", flexDirection: "row", gap: space.md },
  sunk: relief.pressed,
  title: { ...typography.display, color: colors.text },
});
